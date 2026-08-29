import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, jsonBody, staticFiles } from './http.js';
import {
  anonymizeTrustRequest, createResetSchedule, clientIp, publicModeConfig, rateLimit,
  readinessDetailAllowed, sanitizeTrustRequest, securityHeaders, sweepExpired, throttleKeyFor,
} from './public-mode.js';
import { isProduction, validateRuntimeConfig } from './runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'web', 'dist');

export const RELEASE = {
  service: 'vantage',
  version: process.env.APP_VERSION || '2.1.0',
  release_sha: process.env.RELEASE_SHA || 'unversioned',
  source_digest: process.env.SOURCE_DIGEST || 'unrecorded',
  node: process.version,
  started_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Production mode: fail closed unless explicitly configured as safe.
// ---------------------------------------------------------------------------

const runtimeConfig = validateRuntimeConfig();
if (!runtimeConfig.ok) {
  console.error('[vantage] FATAL: runtime configuration errors:');
  for (const e of runtimeConfig.errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (runtimeConfig.sessionSecret) {
  process.env.VANTAGE_SESSION_SECRET = runtimeConfig.sessionSecret;
}
const PRODUCTION = isProduction();
if (PRODUCTION) {
  console.log('[vantage] starting in PRODUCTION mode (multi-tenant, no demo data)');
}

const { db, all, get, run, setting, setSetting, logActivity, DB_PATH } = await import('./db.js');
const { runTests, controlStatuses, frameworkReadiness, overallPosture } = await import('./engine.js');
const { hashPassword, seed, verifyPassword } = await import('./seed.js');
const { createTenant } = await import('./tenant.js');

export const PUBLIC_MODE = publicModeConfig();

const RESET_MARKER = 'demo_reset';
const FUTURE_SKEW_MS = 5 * 60_000;
const DEMO_TENANT_ID = 1;

const readLastReset = () => {
  let raw;
  try { raw = setting(RESET_MARKER, null, DEMO_TENANT_ID)?.at; } catch { return null; }
  if (!raw) return null;
  const at = new Date(raw).getTime();
  if (!Number.isFinite(at)) return null;
  if (at > Date.now() + FUTURE_SKEW_MS) return null;
  return new Date(at).toISOString();
};
const persistLastReset = (at) => {
  try { setSetting(RESET_MARKER, { at }, DEMO_TENANT_ID); } catch (err) { console.error('[vantage] could not persist the reset marker:', err?.message || err); }
};

const app = createApp();
app.use(securityHeaders({ hsts: PUBLIC_MODE.hsts }));
app.use(rateLimit({ trustProxy: PUBLIC_MODE.trustProxy, enabled: PUBLIC_MODE.rateLimit }));
app.use(jsonBody({ limit: 256_000 }));

// In production mode, do NOT seed demo data.
if (!PRODUCTION) {
  seed();
  // Demo data is seeded after db.js has normalised persisted integrations.
  // Normalise it here too so a fresh demo never claims live collection.
  run("UPDATE integrations SET status = 'configured', last_sync = NULL WHERE status = 'connected'");
}

const resetSchedule = PRODUCTION
  ? { enabled: false, interval_minutes: 0, next_reset_at: null, due: () => false, markRun: () => {} }
  : createResetSchedule({
      intervalMinutes: PUBLIC_MODE.resetMinutes,
      last: readLastReset(),
    });
if (resetSchedule.enabled) {
  if (readLastReset() !== resetSchedule.last_reset_at) persistLastReset(resetSchedule.last_reset_at);
  if (resetSchedule.due()) {
    try {
      seed({ force: true });
      resetSchedule.markRun();
      persistLastReset(resetSchedule.last_reset_at);
      console.log('[vantage] shared demo data was overdue at boot and has been reset');
    } catch (err) {
      console.error('[vantage] overdue demo reset failed:', err?.stack || err);
    }
  }
}

/* --------------------------------------------------- health and readiness */

app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    ...RELEASE,
    uptime_seconds: Math.round(process.uptime()),
  });
});

app.get('/readyz', (req, res) => {
  const checks = {};
  let ready = true;
  const detailed = readinessDetailAllowed(req);
  const record = (name, ok, reason, detail) => {
    checks[name] = { ok, detail: detailed ? detail : reason };
    if (!ok) ready = false;
  };

  try {
    const integrity = get('PRAGMA quick_check');
    const result = Object.values(integrity || {})[0];
    record('database', result === 'ok', result === 'ok' ? 'ok' : 'integrity_check_failed',
      `${DB_PATH} quick_check=${result}`);
  } catch (err) {
    record('database', false, 'database_unreadable', String(err.message));
  }
  try {
    const fwCount = get('SELECT COUNT(*) AS n FROM frameworks').n;
    const testCount = get('SELECT COUNT(*) AS n FROM tests').n;
    const userCount = get('SELECT COUNT(*) AS n FROM users').n;
    // In production, the database may start empty (no demo seed).
    const seeded = PRODUCTION ? true : (fwCount > 0 && testCount > 0 && userCount > 0);
    record('schema_seeded', seeded, seeded ? 'ok' : 'schema_not_seeded',
      `${fwCount} frameworks, ${testCount} tests, ${userCount} users`);
    const scan = get('SELECT MAX(last_run) AS t FROM tests').t;
    const warmingUp = process.uptime() < 120;
    record('monitoring_engine', !!scan || warmingUp || PRODUCTION,
      scan ? 'ok' : warmingUp || PRODUCTION ? 'warming_up' : 'no_scan_recorded',
      scan ? `last scan ${scan}` : warmingUp || PRODUCTION ? 'warming up, no scan yet' : 'no scan recorded');
  } catch (err) {
    record('schema_seeded', false, 'schema_query_failed', String(err.message));
  }
  try {
    const probe = `readiness_probe_${Date.now()}`;
    db.exec('CREATE TABLE IF NOT EXISTS readiness_probe (id INTEGER PRIMARY KEY CHECK (id = 1), marker TEXT NOT NULL)');
    run('INSERT INTO readiness_probe (id, marker) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET marker = excluded.marker', probe);
    const stored = get('SELECT marker FROM readiness_probe WHERE id = 1');
    const wrote = stored?.marker === probe;
    record('database_writable', wrote, wrote ? 'ok' : 'write_readback_mismatch',
      'write and read back succeeded on the data volume');
  } catch (err) {
    record('database_writable', false, 'data_volume_not_writable', String(err.message));
  }
  const built = existsSync(join(dist, 'index.html'));
  record('frontend_build', built, built ? 'ok' : 'frontend_build_missing', dist);

  res.status(ready ? 200 : 503).json({ ready, service: RELEASE.service, version: RELEASE.version, release_sha: RELEASE.release_sha, checks });
});

/* ------------------------------------------------------------------ auth */

const SESSION_DAYS = Number(process.env.VANTAGE_SESSION_DAYS || 14);
const SIGNUP_LIMITS = { name: 120, email: 200, password: 1024 };
const SIGNUP_MIN_PASSWORD_LENGTH = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const CONNECTION_ACCOUNT_MAX_LENGTH = 160;

function publicUser(user) {
  return user ? { id: user.id, email: user.email, name: user.name, role: user.role, title: user.title } : null;
}

function issueSession(user) {
  run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
  const token = randomUUID();
  run('INSERT INTO sessions (token, user_id, tenant_id, expires_at) VALUES (?, ?, ?, ?)',
    token, user.id, user.tenant_id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  return token;
}

function validateSignup(body = {}) {
  const errors = [];
  const name = typeof body.name === 'string'
    ? body.name.normalize('NFKC').trim().replace(/\s+/g, ' ')
    : '';
  const email = typeof body.email === 'string' ? body.email.normalize('NFKC').trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const company = typeof body.company === 'string' ? body.company.normalize('NFKC').trim() : '';

  if (!name) errors.push('Display name is required');
  else if (name.length < 2) errors.push('Display name must be at least 2 characters');
  else if (name.length > SIGNUP_LIMITS.name) errors.push(`Display name must be ${SIGNUP_LIMITS.name} characters or fewer`);
  else if (CONTROL_CHARS_RE.test(name)) errors.push('Display name contains unsupported characters');

  if (!email) errors.push('Email is required');
  else if (email.length > SIGNUP_LIMITS.email) errors.push(`Email must be ${SIGNUP_LIMITS.email} characters or fewer`);
  else if (CONTROL_CHARS_RE.test(email) || !EMAIL_RE.test(email)) errors.push('Email must be a valid address');

  if (!password) errors.push('Password is required');
  else if (password.length < SIGNUP_MIN_PASSWORD_LENGTH) errors.push(`Password must be at least ${SIGNUP_MIN_PASSWORD_LENGTH} characters`);
  else if (password.length > SIGNUP_LIMITS.password) errors.push(`Password must be ${SIGNUP_LIMITS.password} characters or fewer`);
  else if (!password.trim()) errors.push('Password must include non-space characters');

  // In production mode, company is required for tenant creation.
  if (PRODUCTION && !company) errors.push('Company name is required');
  if (company && company.length > 160) errors.push('Company name must be 160 characters or fewer');

  return { ok: errors.length === 0, value: { name, email, password, company }, errors };
}

function currentUser(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = get('SELECT * FROM sessions WHERE token = ?', token);
  if (!session || new Date(session.expires_at) < new Date()) return null;
  const user = get('SELECT id, tenant_id, email, name, role, title FROM users WHERE id = ? AND tenant_id = ?', session.user_id, session.tenant_id);
  return user || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!user.tenant_id) return res.status(403).json({ error: 'Tenant context missing' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'This action requires an administrator role' });
  }
  next();
}

function enforceReadOnlyRoles(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.user?.role === 'auditor' && req.path !== '/auth/logout') {
    return res.status(403).json({ error: 'Auditor accounts have read-only access' });
  }
  next();
}

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_MAX_TRACKED_KEYS = 5000;
let lastThrottleSweep = 0;

function loginThrottle(key, now = Date.now()) {
  if (now - lastThrottleSweep > 60_000 || loginAttempts.size > LOGIN_MAX_TRACKED_KEYS) {
    lastThrottleSweep = now;
    sweepExpired(loginAttempts, now, LOGIN_WINDOW_MS, LOGIN_MAX_TRACKED_KEYS);
  }
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { first: now, count: 1 });
    return { blocked: false };
  }
  entry.count += 1;
  return { blocked: entry.count > LOGIN_MAX_ATTEMPTS, retry_after_seconds: Math.ceil((entry.first + LOGIN_WINDOW_MS - now) / 1000) };
}

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const throttleKey = throttleKeyFor(
    clientIp(req, { trustProxy: PUBLIC_MODE.trustProxy }),
    String(email || '').toLowerCase().trim(),
  );
  const throttle = loginThrottle(throttleKey);
  if (throttle.blocked) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.', retry_after_seconds: throttle.retry_after_seconds });
  }
  // In demo mode, look up by email in the demo tenant. In production, email
  // is unique within each tenant, so we find all matching users and try each.
  const normalEmail = String(email || '').toLowerCase().trim();
  let user;
  if (PRODUCTION) {
    // In production, find matching users across tenants and verify password.
    // This does not reveal which tenant the email belongs to.
    // The migration's synthetic default tenant is quarantined from
    // production login; a freshly created customer tenant may legitimately
    // receive the first numeric ID.
    const candidates = all(`SELECT u.* FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE NOT (t.id = ? AND t.slug = 'default' AND t.name = 'Default Tenant')
        AND u.email = ?`, DEMO_TENANT_ID, normalEmail);
    user = candidates.find((u) => verifyPassword(String(password || ''), u.password_hash));
  } else {
    user = get('SELECT * FROM users WHERE tenant_id = ? AND email = ?', DEMO_TENANT_ID, normalEmail);
    if (user && !verifyPassword(String(password || ''), user.password_hash)) user = null;
  }
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  loginAttempts.delete(throttleKey);
  const token = issueSession(user);
  logActivity('auth', user.name, 'Signed in to Vantage', user.tenant_id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/signup', (req, res) => {
  const { ok, value, errors } = validateSignup(req.body || {});
  if (!ok) return res.status(400).json({ error: 'Check your signup details and try again.', errors });

  if (PRODUCTION) {
    // Production signup: create a new tenant + admin user.
    // Prevent email enumeration: always return 409 with a generic message.
    const existingUser = get(`SELECT u.id FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE NOT (t.id = ? AND t.slug = 'default' AND t.name = 'Default Tenant')
        AND u.email = ?`, DEMO_TENANT_ID, value.email);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }

    let tenant;
    try {
      tenant = createTenant(value.company);
    } catch (err) {
      console.error('[vantage] tenant creation failed:', err?.message || err);
      return res.status(500).json({ error: 'Could not create workspace. Try again.' });
    }

    try {
      run('INSERT INTO users (tenant_id, email, name, password_hash, role, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        tenant.id, value.email, value.name, hashPassword(value.password), 'admin', 'Workspace owner', new Date().toISOString());
    } catch (err) {
      if (String(err?.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      }
      throw err;
    }

    const user = get('SELECT * FROM users WHERE tenant_id = ? AND email = ?', tenant.id, value.email);
    const token = issueSession(user);
    // Set initial company settings for the tenant
    setSetting('company', { name: value.company }, tenant.id);
    logActivity('auth', user.name, 'Created workspace and signed up as owner', tenant.id);
    return res.status(201).json({ token, user: publicUser(user) });
  }

  // Demo mode: create a contributor in the demo tenant.
  if (get('SELECT id FROM users WHERE tenant_id = ? AND email = ?', DEMO_TENANT_ID, value.email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  }
  if (get('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?', DEMO_TENANT_ID).n >= PUBLIC_MODE.maxUsers) {
    return res.status(429).json({ error: 'This shared demonstration has reached its signup capacity. Try again later.' });
  }

  try {
    run('INSERT INTO users (tenant_id, email, name, password_hash, role, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      DEMO_TENANT_ID, value.email, value.name, hashPassword(value.password), 'contributor', 'Workspace member', new Date().toISOString());
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }
    throw err;
  }

  const user = get('SELECT * FROM users WHERE tenant_id = ? AND email = ?', DEMO_TENANT_ID, value.email);
  const token = issueSession(user);
  logActivity('auth', user.name, 'Created a Vantage account', DEMO_TENANT_ID);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = (req.get('authorization') || '').slice(7);
  run('DELETE FROM sessions WHERE token = ?', token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const tid = req.user.tenant_id;
  res.json({
    user: req.user,
    company: setting('company', null, tid),
    release: RELEASE,
    public_demo: PUBLIC_MODE.publicDemo,
    source_url: PUBLIC_MODE.sourceUrl,
    next_reset_at: resetSchedule.next_reset_at,
  });
});

/* ------------------------------------------------------- public endpoints */

// The public trust center reads from the demo tenant in demo mode.
// In production, it reads from the tenant whose slug matches the request,
// but for now we scope to a single-tenant public view.
function publicTenantId() {
  return DEMO_TENANT_ID;
}

app.get('/api/public/trust', (req, res) => {
  if (PRODUCTION) return res.status(404).json({ error: 'No public Trust Center is configured' });
  const tid = publicTenantId();
  const company = setting('company', null, tid);
  const trust = setting('trust_center', null, tid);
  const statuses = controlStatuses(tid);
  const fws = all('SELECT * FROM frameworks WHERE tenant_id = ? AND enabled = 1', tid).map((f) => {
    const r = frameworkReadiness(f.id, tid);
    return { slug: f.slug, name: f.name, short_name: f.short_name, color: f.color, category: f.category, readiness: r.readiness, audit_status: f.audit_status };
  });
  const publicStatus = (status) => (status === 'passing' ? 'verified' : 'in_progress');
  const ctls = all('SELECT * FROM controls WHERE tenant_id = ? ORDER BY code', tid).map((c) => ({
    code: c.code, name: c.name, category: c.category, description: c.description,
    status: publicStatus(statuses.get(c.id)?.status || 'no_tests'),
  }));
  const grouped = {};
  for (const c of ctls) (grouped[c.category] ||= []).push(c);
  const verified = ctls.filter((c) => c.status === 'verified').length;
  const posture = {
    controls_monitored: ctls.length,
    controls_verified: verified,
    coverage_percent: ctls.length ? Math.round((verified / ctls.length) * 100) : 0,
  };
  res.json({
    company, trust, frameworks: fws,
    control_groups: Object.entries(grouped).map(([category, items]) => ({ category, items })),
    documents: all('SELECT id, name, type, description, gated, updated_at FROM trust_documents WHERE tenant_id = ? ORDER BY gated, name', tid),
    subprocessors: all("SELECT name, category, description, data_processed FROM vendors WHERE tenant_id = ? AND subprocessor = 1 AND status = 'active' ORDER BY name", tid),
    posture,
    updated_at: get('SELECT MAX(last_run) AS t FROM tests WHERE tenant_id = ?', tid).t,
  });
});

app.post('/api/public/trust/request', (req, res) => {
  if (PRODUCTION) return res.status(404).json({ error: 'No public Trust Center is configured' });
  const tid = publicTenantId();
  const { ok: valid, value, errors } = sanitizeTrustRequest(req.body || {});
  if (!valid) return res.status(400).json({ error: errors[0], errors });
  const document = get('SELECT name FROM trust_documents WHERE tenant_id = ? AND name = ?', tid, value.document);
  if (!document) return res.status(400).json({ error: 'Unknown document' });
  const pending = get("SELECT COUNT(*) AS n FROM trust_requests WHERE tenant_id = ? AND status = 'pending'", tid).n;
  if (pending >= PUBLIC_MODE.maxPendingTrustRequests) {
    return res.status(429).json({ error: 'The access-request queue is full on this shared demonstration. Try again later.' });
  }
  const stored = anonymizeTrustRequest(value, {
    publicDemo: PUBLIC_MODE.publicDemo,
    counter: get('SELECT COUNT(*) AS n FROM trust_requests WHERE tenant_id = ?', tid).n + 1,
    canonicalDocument: document.name,
  });
  run('INSERT INTO trust_requests (tenant_id, name, email, company, document, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    tid, stored.name, stored.email, stored.company, stored.document, 'pending', new Date().toISOString());
  logActivity('trust_center', stored.company, `${stored.name} requested access to "${stored.document}"`, tid);
  res.json({
    ok: true,
    anonymized: stored.anonymized,
    message: stored.anonymized
      ? 'Request received. This is a shared public demonstration, so your name, email and company were discarded rather than stored \u2014 the queue shows an anonymous demonstration request.'
      : 'Request received. You will receive an email once it is approved.',
  });
});

app.get('/api/public/config', (req, res) => {
  const tid = publicTenantId();
  res.json({
    service: RELEASE.service,
    version: RELEASE.version,
    release_sha: RELEASE.release_sha,
    public_demo: PUBLIC_MODE.publicDemo,
    production: PRODUCTION,
    source_url: PUBLIC_MODE.sourceUrl,
    guards: {
      rate_limit: PUBLIC_MODE.rateLimit,
      signup_rate_limit: PUBLIC_MODE.rateLimit,
      security_headers: true,
      anonymous_writes_anonymized: PUBLIC_MODE.publicDemo,
      auto_reset: resetSchedule.enabled,
      // CSRF note: Vantage uses Bearer token authentication. Bearer tokens
      // are not automatically attached by browsers to cross-origin requests,
      // so CSRF protection is inherent in the authentication scheme.
      csrf_protection: 'bearer_token',
    },
    signup: {
      enabled: true,
      password_min_length: SIGNUP_MIN_PASSWORD_LENGTH,
      max_users: PRODUCTION ? null : PUBLIC_MODE.maxUsers,
      requires_company: PRODUCTION,
    },
    demo: PRODUCTION ? { shared: false } : {
      shared: PUBLIC_MODE.publicDemo,
      password: 'vantage123',
      accounts: all('SELECT email, name, role, title FROM users WHERE tenant_id = ? ORDER BY id', tid),
      auto_reset: resetSchedule.enabled,
      reset_interval_minutes: resetSchedule.enabled ? resetSchedule.interval_minutes : null,
      next_reset_at: resetSchedule.next_reset_at,
    },
  });
});

const isPublicApiPath = (path) => ['/public', '/auth'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

app.use('/api', (req, res, next) => {
  if (isPublicApiPath(req.path)) return next();
  return requireAuth(req, res, (err) => (err ? next(err) : enforceReadOnlyRoles(req, res, next)));
});

/* -------------------------------------------------------------- dashboard */

function frameworkSummary(tid) {
  return all('SELECT * FROM frameworks WHERE tenant_id = ? ORDER BY enabled DESC, name', tid).map((f) => {
    const r = frameworkReadiness(f.id, tid);
    return {
      ...f, enabled: !!f.enabled, readiness: r.readiness, requirements_total: r.total,
      requirements_complete: r.complete, requirements_at_risk: r.at_risk,
      controls_total: r.controls_total, controls_failing: r.controls_failing, controls_ok: r.controls_ok,
    };
  });
}

app.get('/api/dashboard', (req, res) => {
  const tid = req.user.tenant_id;
  const posture = overallPosture(tid);
  const fws = frameworkSummary(tid);
  const enabled = fws.filter((f) => f.enabled);
  const failing = all(`SELECT t.*, c.code AS control_code, c.name AS control_name FROM tests t
    JOIN controls c ON c.id = t.control_id AND c.tenant_id = t.tenant_id
    WHERE t.tenant_id = ? AND t.status = 'failing' ORDER BY
      CASE t.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.deadline`, tid);
  const people = get(`SELECT
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'active' AND security_training = 'complete' THEN 1 ELSE 0 END) AS trained,
      SUM(CASE WHEN status = 'offboarded' THEN 1 ELSE 0 END) AS offboarded FROM personnel WHERE tenant_id = ?`, tid);
  const acceptance = get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN accepted = expected THEN 1 ELSE 0 END) AS complete FROM (
      SELECT p.id, (SELECT COUNT(*) FROM policies WHERE tenant_id = ? AND status='approved') AS expected,
        (SELECT COUNT(*) FROM policy_acceptances a JOIN policies pol ON pol.id = a.policy_id AND pol.tenant_id = a.tenant_id
          WHERE a.tenant_id = p.tenant_id AND a.personnel_id = p.id AND pol.status='approved') AS accepted
      FROM personnel p WHERE p.tenant_id = ? AND p.status='active')`, tid, tid);
  res.json({
    posture,
    frameworks: enabled,
    all_frameworks: fws,
    overall_readiness: enabled.length ? Math.round(enabled.reduce((a, f) => a + f.readiness, 0) / enabled.length) : 0,
    failing_tests: failing.slice(0, 12),
    failing_by_severity: ['critical', 'high', 'medium', 'low'].map((s) => ({ severity: s, count: failing.filter((t) => t.severity === s).length })),
    people: { ...people, training_pct: people?.active ? Math.round((people.trained / people.active) * 100) : 0 },
    policy_acceptance_pct: acceptance?.total ? Math.round((acceptance.complete / acceptance.total) * 100) : 0,
    devices: get(`SELECT COUNT(*) AS total, SUM(CASE WHEN encrypted = 1 AND screen_lock = 1 AND antivirus = 1 AND os_up_to_date = 1 THEN 1 ELSE 0 END) AS compliant FROM devices WHERE tenant_id = ?`, tid),
    vendors: get(`SELECT COUNT(*) AS total, SUM(CASE WHEN security_review_status = 'complete' THEN 1 ELSE 0 END) AS reviewed,
      SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) AS high_risk FROM vendors WHERE tenant_id = ? AND status='active'`, tid),
    risks: get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN due_date < date('now') AND status='open' THEN 1 ELSE 0 END) AS overdue FROM risks WHERE tenant_id = ?`, tid),
    integrations: get("SELECT COUNT(*) AS total, SUM(CASE WHEN status='configured' THEN 1 ELSE 0 END) AS configured FROM integrations WHERE tenant_id = ?", tid),
    monitored_resources: get('SELECT COUNT(*) AS n FROM resources WHERE tenant_id = ?', tid).n,
    audit: (() => {
      const audit = get("SELECT a.*, f.short_name FROM audits a JOIN frameworks f ON f.id = a.framework_id AND f.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.status != 'complete' ORDER BY a.period_end LIMIT 1", tid);
      if (!audit) return null;
      const reqs = get("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted FROM audit_requests WHERE tenant_id = ? AND audit_id = ?", tid, audit.id);
      return { ...audit, ...reqs };
    })(),
    activity: all('SELECT * FROM activity WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 12', tid),
    last_run: get('SELECT MAX(last_run) AS t FROM tests WHERE tenant_id = ?', tid).t,
  });
});

/* ------------------------------------------------------------- frameworks */

app.get('/api/frameworks', (req, res) => res.json(frameworkSummary(req.user.tenant_id)));

app.get('/api/frameworks/:slug', (req, res) => {
  const tid = req.user.tenant_id;
  const f = get('SELECT * FROM frameworks WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!f) return res.status(404).json({ error: 'Framework not found' });
  const r = frameworkReadiness(f.id, tid);
  const controlRows = all('SELECT id, code, name, category, description FROM controls WHERE tenant_id = ?', tid);
  const controlById = new Map(controlRows.map((c) => [c.id, c]));
  const statuses = controlStatuses(tid);
  const sections = {};
  for (const req_ of r.requirements) {
    (sections[req_.section] ||= []).push({
      ...req_,
      controls: req_.controls.map((c) => ({ ...controlById.get(c.id), status: statuses.get(c.id)?.status || 'no_tests' })),
    });
  }
  res.json({
    framework: { ...f, enabled: !!f.enabled },
    readiness: r.readiness,
    controls_total: r.controls_total,
    controls_failing: r.controls_failing,
    controls_ok: r.controls_ok,
    complete: r.complete,
    total: r.total,
    at_risk: r.at_risk,
    sections: Object.entries(sections).map(([section, reqs]) => ({ section, requirements: reqs })),
  });
});

app.post('/api/frameworks/:slug/toggle', requireAdmin, (req, res) => {
  const tid = req.user.tenant_id;
  const f = get('SELECT * FROM frameworks WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!f) return res.status(404).json({ error: 'Framework not found' });
  run('UPDATE frameworks SET enabled = ? WHERE id = ? AND tenant_id = ?', f.enabled ? 0 : 1, f.id, tid);
  logActivity('framework', req.user.name, `${f.enabled ? 'Disabled' : 'Enabled'} the ${f.name} framework`, tid);
  res.json({ ok: true, enabled: !f.enabled });
});

/* --------------------------------------------------------------- controls */

app.get('/api/controls', (req, res) => {
  const tid = req.user.tenant_id;
  const statuses = controlStatuses(tid);
  const owners = new Map(all('SELECT id, name FROM users WHERE tenant_id = ?', tid).map((u) => [u.id, u.name]));
  const frameworksByControl = all(`SELECT cr.control_id, f.short_name, f.slug, f.color FROM control_requirements cr
    JOIN requirements r ON r.id = cr.requirement_id AND r.tenant_id = cr.tenant_id JOIN frameworks f ON f.id = r.framework_id AND f.tenant_id = r.tenant_id
    WHERE cr.tenant_id = ? AND f.enabled = 1 GROUP BY cr.control_id, f.id`, tid);
  const fwMap = new Map();
  for (const row of frameworksByControl) {
    if (!fwMap.has(row.control_id)) fwMap.set(row.control_id, []);
    fwMap.get(row.control_id).push({ short_name: row.short_name, slug: row.slug, color: row.color });
  }
  res.json(all('SELECT * FROM controls WHERE tenant_id = ? ORDER BY code', tid).map((c) => ({
    ...c,
    owner: owners.get(c.owner_id) || 'Unassigned',
    ...(statuses.get(c.id) || { status: 'no_tests', tests: 0, failing: 0 }),
    frameworks: fwMap.get(c.id) || [],
  })));
});

app.get('/api/controls/:code', (req, res) => {
  const tid = req.user.tenant_id;
  const c = get('SELECT * FROM controls WHERE tenant_id = ? AND code = ?', tid, req.params.code);
  if (!c) return res.status(404).json({ error: 'Control not found' });
  const statuses = controlStatuses(tid);
  res.json({
    ...c,
    owner: get('SELECT name, email FROM users WHERE id = ? AND tenant_id = ?', c.owner_id, tid),
    ...(statuses.get(c.id) || { status: 'no_tests', tests: 0, failing: 0 }),
    tests_detail: all('SELECT * FROM tests WHERE tenant_id = ? AND control_id = ? ORDER BY name', tid, c.id),
    evidence: all('SELECT * FROM evidence WHERE tenant_id = ? AND control_id = ? ORDER BY collected_at DESC', tid, c.id),
    requirements: all(`SELECT r.code, r.title, r.section, f.short_name, f.slug, f.color FROM control_requirements cr
      JOIN requirements r ON r.id = cr.requirement_id AND r.tenant_id = cr.tenant_id JOIN frameworks f ON f.id = r.framework_id AND f.tenant_id = r.tenant_id
      WHERE cr.tenant_id = ? AND cr.control_id = ? ORDER BY f.name, r.code`, tid, c.id),
  });
});

app.patch('/api/controls/:code', (req, res) => {
  const tid = req.user.tenant_id;
  const c = get('SELECT * FROM controls WHERE tenant_id = ? AND code = ?', tid, req.params.code);
  if (!c) return res.status(404).json({ error: 'Control not found' });
  const { owner_id } = req.body || {};
  if (owner_id) {
    const owner = get('SELECT name FROM users WHERE id = ? AND tenant_id = ?', owner_id, tid);
    if (!owner) return res.status(400).json({ error: 'Owner not found in this workspace' });
    run('UPDATE controls SET owner_id = ? WHERE id = ? AND tenant_id = ?', owner_id, c.id, tid);
    logActivity('control', req.user.name, `Assigned control ${c.code} ${c.name} to ${owner.name}`, tid);
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ tests */

const testQuery = (tid) => `SELECT t.*, c.code AS control_code, c.name AS control_name, c.category AS control_category FROM tests t
  JOIN controls c ON c.id = t.control_id AND c.tenant_id = t.tenant_id WHERE t.tenant_id = ${Number(tid)}`;

app.get('/api/tests', (req, res) => {
  const tid = req.user.tenant_id;
  const { status, severity, integration, q } = req.query;
  let rows = all(`${testQuery(tid)} ORDER BY CASE t.status WHEN 'failing' THEN 0 WHEN 'ok' THEN 1 ELSE 2 END,
    CASE t.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.name`);
  if (status) rows = rows.filter((r) => r.status === status);
  if (severity) rows = rows.filter((r) => r.severity === severity);
  if (integration) rows = rows.filter((r) => r.integration === integration);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => `${r.name} ${r.description} ${r.control_code}`.toLowerCase().includes(needle));
  }
  res.json({
    tests: rows.map((r) => ({ ...r, disabled: !!r.disabled })),
    facets: {
      integrations: [...new Set(all('SELECT integration FROM tests WHERE tenant_id = ?', tid).map((t) => t.integration))].sort(),
      counts: {
        all: all('SELECT id FROM tests WHERE tenant_id = ?', tid).length,
        failing: all("SELECT id FROM tests WHERE tenant_id = ? AND status = 'failing'", tid).length,
        ok: all("SELECT id FROM tests WHERE tenant_id = ? AND status = 'ok'", tid).length,
        disabled: all('SELECT id FROM tests WHERE tenant_id = ? AND disabled = 1', tid).length,
      },
    },
  });
});

app.get('/api/tests/:slug', (req, res) => {
  const tid = req.user.tenant_id;
  const t = get(`SELECT t.*, c.code AS control_code, c.name AS control_name, c.category AS control_category FROM tests t
    JOIN controls c ON c.id = t.control_id AND c.tenant_id = t.tenant_id WHERE t.tenant_id = ? AND t.slug = ?`, tid, req.params.slug);
  if (!t) return res.status(404).json({ error: 'Test not found' });
  res.json({
    ...t, disabled: !!t.disabled, rule: JSON.parse(t.rule),
    entities: all('SELECT * FROM test_entities WHERE tenant_id = ? AND test_id = ? ORDER BY passed, entity_name', tid, t.id).map((e) => ({ ...e, passed: !!e.passed })),
  });
});

app.post('/api/tests/run', (req, res) => {
  const tid = req.user.tenant_id;
  const result = runTests({ actor: req.user.name, tenantId: tid });
  logActivity('monitoring', req.user.name, `Ran all ${result.ran} automated tests`, tid);
  res.json(result);
});

app.post('/api/tests/:slug/run', (req, res) => {
  const tid = req.user.tenant_id;
  const t = get('SELECT * FROM tests WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!t) return res.status(404).json({ error: 'Test not found' });
  res.json(runTests({ actor: req.user.name, testIds: [t.id], tenantId: tid }));
});

app.post('/api/tests/:slug/toggle', (req, res) => {
  const tid = req.user.tenant_id;
  const t = get('SELECT * FROM tests WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!t) return res.status(404).json({ error: 'Test not found' });
  run('UPDATE tests SET disabled = ? WHERE id = ? AND tenant_id = ?', t.disabled ? 0 : 1, t.id, tid);
  logActivity('monitoring', req.user.name, `${t.disabled ? 'Enabled' : 'Deactivated'} test "${t.name}"`, tid);
  runTests({ actor: req.user.name, testIds: [t.id], tenantId: tid });
  res.json({ ok: true, disabled: !t.disabled });
});

/* ------------------------------------------------------------ remediation */

function desiredValue(rule) {
  switch (rule.op) {
    case 'eq': return rule.value;
    case 'in': return Array.isArray(rule.value) ? rule.value[0] : rule.value;
    case 'gte': case 'lte': return Number(rule.value);
    case 'gt': return Number(rule.value) + 1;
    case 'lt': return Number(rule.value) - 1;
    case 'neq': return null;
    case 'within_days': return new Date().toISOString();
    case 'exists': return 'documented';
    default: return rule.value;
  }
}

const REMEDIABLE_FIELDS = {
  device: ['encrypted', 'screen_lock', 'antivirus', 'os_up_to_date', 'last_checkin'],
  personnel: ['security_training', 'background_check', 'offboarded_access_removed'],
  vendor: ['security_review_status', 'last_reviewed', 'soc2', 'iso27001'],
};

app.post('/api/tests/:slug/remediate', (req, res) => {
  const tid = req.user.tenant_id;
  const t = get('SELECT * FROM tests WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!t) return res.status(404).json({ error: 'Test not found' });
  const rule = JSON.parse(t.rule);
  const allowed = REMEDIABLE_FIELDS[rule.kind];
  if (allowed && !allowed.includes(rule.field)) {
    return res.status(400).json({ error: `Field '${rule.field}' is not remediable for ${rule.kind}` });
  }
  const entityId = req.body?.entity_id;
  const target = desiredValue(rule);
  const fixed = [];

  const entities = entityId
    ? all('SELECT * FROM test_entities WHERE tenant_id = ? AND test_id = ? AND entity_id = ?', tid, t.id, entityId)
    : all('SELECT * FROM test_entities WHERE tenant_id = ? AND test_id = ? AND passed = 0', tid, t.id);

  for (const e of entities) {
    switch (rule.kind) {
      case 'resource': {
        const resource = get('SELECT * FROM resources WHERE tenant_id = ? AND external_id = ? AND type = ?', tid, e.entity_id, rule.type);
        if (!resource) break;
        const meta = JSON.parse(resource.metadata);
        meta[rule.field] = target;
        run('UPDATE resources SET metadata = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(meta), resource.id, tid);
        fixed.push(e.entity_name);
        break;
      }
      case 'device': {
        const id = Number(e.entity_id.replace('device-', ''));
        const value = rule.field === 'last_checkin' ? new Date().toISOString() : (target === true ? 1 : target === false ? 0 : target);
        run(`UPDATE devices SET ${rule.field} = ? WHERE id = ? AND tenant_id = ?`, value, id, tid);
        fixed.push(e.entity_name);
        break;
      }
      case 'personnel': {
        const id = Number(e.entity_id.replace('person-', ''));
        run(`UPDATE personnel SET ${rule.field} = ? WHERE id = ? AND tenant_id = ?`, target === true ? 1 : target, id, tid);
        fixed.push(e.entity_name);
        break;
      }
      case 'policy_acceptance': {
        const id = Number(e.entity_id.replace('person-', ''));
        for (const p of all("SELECT id FROM policies WHERE tenant_id = ? AND status = 'approved'", tid)) {
          run('INSERT OR IGNORE INTO policy_acceptances (tenant_id, policy_id, personnel_id, accepted_at) VALUES (?, ?, ?, ?)', tid, p.id, id, new Date().toISOString());
        }
        fixed.push(e.entity_name);
        break;
      }
      case 'policy': {
        const policy = get('SELECT * FROM policies WHERE tenant_id = ? AND slug = ?', tid, e.entity_id);
        if (!policy) break;
        run("UPDATE policies SET status = 'approved', approved_at = ?, renewal_date = ?, version = ? WHERE id = ? AND tenant_id = ?",
          new Date().toISOString(), new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          policy.status === 'approved' ? policy.version : '1.0', policy.id, tid);
        fixed.push(e.entity_name);
        break;
      }
      case 'vendor': {
        const id = Number(e.entity_id.replace('vendor-', ''));
        const value = rule.field === 'last_reviewed' ? new Date().toISOString() : target;
        run(`UPDATE vendors SET ${rule.field} = ?, last_reviewed = ?, next_review = ? WHERE id = ? AND tenant_id = ?`,
          value, new Date().toISOString(), new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), id, tid);
        fixed.push(e.entity_name);
        break;
      }
      case 'risk': {
        run("UPDATE risks SET due_date = ? WHERE tenant_id = ? AND code = ?", new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), tid, e.entity_id);
        fixed.push(e.entity_name);
        break;
      }
      default: break;
    }
  }

  const result = runTests({ actor: req.user.name, testIds: [t.id], tenantId: tid });
  if (fixed.length) logActivity('remediation', req.user.name, `Remediated ${fixed.length} ${fixed.length === 1 ? 'entity' : 'entities'} for "${t.name}"`, tid);
  res.json({ fixed, count: fixed.length, ...result, test: get(`SELECT t.*, c.code AS control_code, c.name AS control_name FROM tests t JOIN controls c ON c.id = t.control_id AND c.tenant_id = t.tenant_id WHERE t.tenant_id = ? AND t.id = ?`, tid, t.id) });
});

/* -------------------------------------------------------------- inventory */

app.get('/api/resources', (req, res) => {
  const tid = req.user.tenant_id;
  const rows = all('SELECT * FROM resources WHERE tenant_id = ? ORDER BY integration, type, name', tid).map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }));
  const filtered = req.query.type ? rows.filter((r) => r.type === req.query.type) : rows;
  res.json({ resources: filtered, types: [...new Set(rows.map((r) => r.type))].sort(), total: rows.length });
});

app.get('/api/integrations', (req, res) => {
  const tid = req.user.tenant_id;
  const counts = all('SELECT integration, COUNT(*) AS n FROM resources WHERE tenant_id = ? GROUP BY integration', tid);
  const testCounts = all('SELECT integration, COUNT(*) AS n FROM tests WHERE tenant_id = ? GROUP BY integration', tid);
  const byIntegration = Object.fromEntries(counts.map((c) => [c.integration, c.n]));
  const byTests = Object.fromEntries(testCounts.map((c) => [c.integration, c.n]));
  res.json(all('SELECT * FROM integrations WHERE tenant_id = ? ORDER BY status DESC, name', tid).map((i) => ({
    ...i, resource_count: byIntegration[i.slug] || 0, test_count: byTests[i.slug] || 0,
  })));
});

function validateConnectionAccount(value) {
  if (typeof value !== 'string') return null;
  const account = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (account.length < 2 || account.length > CONNECTION_ACCOUNT_MAX_LENGTH || CONTROL_CHARS_RE.test(account)) return null;
  return account;
}

app.post('/api/integrations/:slug/:action', requireAdmin, (req, res) => {
  const tid = req.user.tenant_id;
  const i = get('SELECT * FROM integrations WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!i) return res.status(404).json({ error: 'Integration not found' });
  const now = new Date().toISOString();
  if (req.params.action === 'connect') {
    const account = validateConnectionAccount(req.body?.account);
    if (!account) {
      return res.status(400).json({ error: `Connection reference must be 2-${CONNECTION_ACCOUNT_MAX_LENGTH} characters and cannot contain control characters` });
    }
    run("UPDATE integrations SET status = 'configured', connected_at = ?, last_sync = NULL, account = ? WHERE id = ? AND tenant_id = ?",
      now, account, i.id, tid);
    logActivity('integration', req.user.name, `Configured ${i.name} for ${account}`, tid);
  } else if (req.params.action === 'disconnect') {
    run("UPDATE integrations SET status = 'available', account = NULL, connected_at = NULL, last_sync = NULL WHERE id = ? AND tenant_id = ?", i.id, tid);
    logActivity('integration', req.user.name, `Removed the ${i.name} configuration`, tid);
  } else if (req.params.action === 'sync') {
    return res.status(409).json({ error: 'Automatic collection is not available for configured services' });
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }
  res.json({ ok: true, integration: get('SELECT * FROM integrations WHERE id = ? AND tenant_id = ?', i.id, tid) });
});

/* --------------------------------------------------------------- policies */

app.get('/api/policies', (req, res) => {
  const tid = req.user.tenant_id;
  const activeCount = get("SELECT COUNT(*) AS n FROM personnel WHERE tenant_id = ? AND status = 'active'", tid).n;
  res.json(all(`SELECT p.*, u.name AS owner,
      (SELECT COUNT(*) FROM policy_acceptances a JOIN personnel pe ON pe.id = a.personnel_id AND pe.tenant_id = a.tenant_id
        WHERE a.tenant_id = p.tenant_id AND a.policy_id = p.id AND pe.status = 'active') AS acceptances
    FROM policies p LEFT JOIN users u ON u.id = p.owner_id AND u.tenant_id = p.tenant_id WHERE p.tenant_id = ? ORDER BY p.category, p.name`, tid)
    .map((p) => ({ ...p, body: undefined, acceptance_pct: activeCount ? Math.round((p.acceptances / activeCount) * 100) : 0, headcount: activeCount })));
});

app.get('/api/policies/:slug', (req, res) => {
  const tid = req.user.tenant_id;
  const p = get('SELECT p.*, u.name AS owner FROM policies p LEFT JOIN users u ON u.id = p.owner_id AND u.tenant_id = p.tenant_id WHERE p.tenant_id = ? AND p.slug = ?', tid, req.params.slug);
  if (!p) return res.status(404).json({ error: 'Policy not found' });
  res.json({
    ...p,
    acceptances: all(`SELECT pe.name, pe.title, a.accepted_at FROM policy_acceptances a
      JOIN personnel pe ON pe.id = a.personnel_id AND pe.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.policy_id = ? ORDER BY a.accepted_at DESC`, tid, p.id),
    outstanding: all(`SELECT pe.name, pe.title, pe.email FROM personnel pe WHERE pe.tenant_id = ? AND pe.status = 'active'
      AND pe.id NOT IN (SELECT personnel_id FROM policy_acceptances WHERE tenant_id = ? AND policy_id = ?) ORDER BY pe.name`, tid, tid, p.id),
  });
});

app.post('/api/policies/:slug/approve', requireAdmin, (req, res) => {
  const tid = req.user.tenant_id;
  const p = get('SELECT * FROM policies WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!p) return res.status(404).json({ error: 'Policy not found' });
  const version = p.status === 'approved' ? `${(parseFloat(p.version) + 0.1).toFixed(1)}` : '1.0';
  run("UPDATE policies SET status = 'approved', approved_at = ?, renewal_date = ?, version = ? WHERE id = ? AND tenant_id = ?",
    new Date().toISOString(), new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), version, p.id, tid);
  logActivity('policy', req.user.name, `Approved "${p.name}" v${version}`, tid);
  runTests({ actor: req.user.name, tenantId: tid });
  res.json({ ok: true });
});

app.post('/api/policies/:slug/remind', (req, res) => {
  const tid = req.user.tenant_id;
  const p = get('SELECT * FROM policies WHERE tenant_id = ? AND slug = ?', tid, req.params.slug);
  if (!p) return res.status(404).json({ error: 'Policy not found' });
  const outstanding = all(`SELECT pe.id FROM personnel pe WHERE pe.tenant_id = ? AND pe.status = 'active'
    AND pe.id NOT IN (SELECT personnel_id FROM policy_acceptances WHERE policy_id = ?)`, tid, p.id);
  logActivity('policy', req.user.name, `Sent acceptance reminders for "${p.name}" to ${outstanding.length} people`, tid);
  res.json({ ok: true, reminded: outstanding.length });
});

/* -------------------------------------------------------------- personnel */

app.get('/api/personnel', (req, res) => {
  const tid = req.user.tenant_id;
  const approved = get("SELECT COUNT(*) AS n FROM policies WHERE tenant_id = ? AND status = 'approved'", tid).n;
  res.json(all(`SELECT p.*,
      (SELECT COUNT(*) FROM policy_acceptances a JOIN policies pol ON pol.id = a.policy_id AND pol.tenant_id = a.tenant_id
        WHERE a.tenant_id = p.tenant_id AND a.personnel_id = p.id AND pol.status = 'approved') AS policies_accepted,
      (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = p.tenant_id AND d.personnel_id = p.id) AS device_count
    FROM personnel p WHERE p.tenant_id = ? ORDER BY p.status, p.name`, tid)
    .map((p) => ({ ...p, policies_expected: approved, offboarded_access_removed: !!p.offboarded_access_removed })));
});

app.get('/api/personnel/:id', (req, res) => {
  const tid = req.user.tenant_id;
  const p = get('SELECT * FROM personnel WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...p,
    devices: all('SELECT * FROM devices WHERE tenant_id = ? AND personnel_id = ?', tid, p.id).map((d) => ({
      ...d, encrypted: !!d.encrypted, screen_lock: !!d.screen_lock, antivirus: !!d.antivirus, os_up_to_date: !!d.os_up_to_date,
    })),
    accepted: all(`SELECT pol.name, pol.slug, a.accepted_at FROM policy_acceptances a
      JOIN policies pol ON pol.id = a.policy_id AND pol.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.personnel_id = ? ORDER BY pol.name`, tid, p.id),
    outstanding: all(`SELECT name, slug FROM policies WHERE tenant_id = ? AND status = 'approved'
      AND id NOT IN (SELECT policy_id FROM policy_acceptances WHERE tenant_id = ? AND personnel_id = ?) ORDER BY name`, tid, tid, p.id),
  });
});

app.post('/api/personnel/:id/:action', (req, res) => {
  const tid = req.user.tenant_id;
  const p = get('SELECT * FROM personnel WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  const actions = {
    complete_training: () => {
      run("UPDATE personnel SET security_training = 'complete', training_due = ? WHERE id = ? AND tenant_id = ?",
        new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), p.id, tid);
      return `Recorded security training completion for ${p.name}`;
    },
    complete_background_check: () => {
      run("UPDATE personnel SET background_check = 'complete' WHERE id = ? AND tenant_id = ?", p.id, tid);
      return `Recorded background check completion for ${p.name}`;
    },
    accept_policies: () => {
      for (const pol of all("SELECT id FROM policies WHERE tenant_id = ? AND status = 'approved'", tid)) {
        run('INSERT OR IGNORE INTO policy_acceptances (tenant_id, policy_id, personnel_id, accepted_at) VALUES (?, ?, ?, ?)', tid, pol.id, p.id, new Date().toISOString());
      }
      return `Recorded policy acceptance for ${p.name}`;
    },
    revoke_access: () => {
      run('UPDATE personnel SET offboarded_access_removed = 1 WHERE id = ? AND tenant_id = ?', p.id, tid);
      return `Confirmed access revocation for ${p.name}`;
    },
  };
  const action = actions[req.params.action];
  if (!action) return res.status(400).json({ error: 'Unknown action' });
  const message = action();
  logActivity('personnel', req.user.name, message, tid);
  runTests({ actor: req.user.name, tenantId: tid });
  res.json({ ok: true, message });
});

app.get('/api/devices', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all(`SELECT d.*, p.name AS owner, p.department, p.status AS owner_status FROM devices d
    JOIN personnel p ON p.id = d.personnel_id AND p.tenant_id = d.tenant_id WHERE d.tenant_id = ? ORDER BY p.name`, tid)
    .map((d) => ({ ...d, encrypted: !!d.encrypted, screen_lock: !!d.screen_lock, antivirus: !!d.antivirus, os_up_to_date: !!d.os_up_to_date })));
});

/* ---------------------------------------------------------------- vendors */

app.get('/api/vendors', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all("SELECT v.*, u.name AS owner FROM vendors v LEFT JOIN users u ON u.id = v.owner_id AND u.tenant_id = v.tenant_id WHERE v.tenant_id = ? ORDER BY CASE v.risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, v.name", tid)
    .map((v) => ({ ...v, subprocessor: !!v.subprocessor, soc2: !!v.soc2, iso27001: !!v.iso27001 })));
});

app.post('/api/vendors/:id/review', (req, res) => {
  const tid = req.user.tenant_id;
  const v = get('SELECT * FROM vendors WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Vendor not found' });
  run("UPDATE vendors SET security_review_status = 'complete', last_reviewed = ?, next_review = ? WHERE id = ? AND tenant_id = ?",
    new Date().toISOString(), new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), v.id, tid);
  logActivity('vendor', req.user.name, `Completed the security review for ${v.name}`, tid);
  runTests({ actor: req.user.name, tenantId: tid });
  res.json({ ok: true });
});

app.patch('/api/vendors/:id', (req, res) => {
  const tid = req.user.tenant_id;
  const v = get('SELECT * FROM vendors WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Vendor not found' });
  const { risk_level, status } = req.body || {};
  if (risk_level) run('UPDATE vendors SET risk_level = ? WHERE id = ? AND tenant_id = ?', risk_level, v.id, tid);
  if (status) run('UPDATE vendors SET status = ? WHERE id = ? AND tenant_id = ?', status, v.id, tid);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ risks */

app.get('/api/risks', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all('SELECT r.*, u.name AS owner FROM risks r LEFT JOIN users u ON u.id = r.owner_id AND u.tenant_id = r.tenant_id WHERE r.tenant_id = ? ORDER BY (r.likelihood * r.impact) DESC', tid)
    .map((r) => ({
      ...r,
      inherent_score: r.likelihood * r.impact,
      residual_score: r.residual_likelihood * r.residual_impact,
      overdue: !!(r.due_date && r.status === 'open' && new Date(r.due_date) < new Date()),
    })));
});

app.patch('/api/risks/:code', (req, res) => {
  const tid = req.user.tenant_id;
  const r = get('SELECT * FROM risks WHERE tenant_id = ? AND code = ?', tid, req.params.code);
  if (!r) return res.status(404).json({ error: 'Risk not found' });
  const fields = ['treatment', 'status', 'due_date', 'residual_likelihood', 'residual_impact', 'mitigation', 'owner_id'];
  for (const f of fields) {
    if (req.body?.[f] !== undefined) run(`UPDATE risks SET ${f} = ? WHERE id = ? AND tenant_id = ?`, req.body[f], r.id, tid);
  }
  logActivity('risk', req.user.name, `Updated risk ${r.code} ${r.title}`, tid);
  runTests({ actor: req.user.name, tenantId: tid });
  res.json({ ok: true });
});

/* ------------------------------------------------------------- audit hub */

app.get('/api/audits', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all('SELECT a.*, f.short_name, f.color, f.slug AS framework_slug FROM audits a JOIN frameworks f ON f.id = a.framework_id AND f.tenant_id = a.tenant_id WHERE a.tenant_id = ? ORDER BY a.period_end', tid)
    .map((a) => ({ ...a, ...get("SELECT COUNT(*) AS requests, SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted FROM audit_requests WHERE tenant_id = ? AND audit_id = ?", tid, a.id) })));
});

app.get('/api/audits/:id', (req, res) => {
  const tid = req.user.tenant_id;
  const a = get('SELECT a.*, f.short_name, f.color, f.slug AS framework_slug FROM audits a JOIN frameworks f ON f.id = a.framework_id AND f.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.id = ?', tid, Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Audit not found' });
  const fw = get('SELECT id FROM frameworks WHERE tenant_id = ? AND slug = ?', tid, a.framework_slug);
  const readiness = fw ? frameworkReadiness(fw.id, tid) : { readiness: 0 };
  res.json({ ...a, readiness: readiness.readiness, requests: all('SELECT * FROM audit_requests WHERE tenant_id = ? AND audit_id = ? ORDER BY ref', tid, a.id) });
});

app.patch('/api/audit-requests/:id', (req, res) => {
  const tid = req.user.tenant_id;
  const r = get('SELECT * FROM audit_requests WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Request not found' });
  const { status, evidence_count } = req.body || {};
  if (status) run('UPDATE audit_requests SET status = ? WHERE id = ? AND tenant_id = ?', status, r.id, tid);
  if (evidence_count !== undefined) run('UPDATE audit_requests SET evidence_count = ? WHERE id = ? AND tenant_id = ?', evidence_count, r.id, tid);
  logActivity('audit', req.user.name, `Updated audit request ${r.ref} to ${status || 'new evidence'}`, tid);
  res.json({ ok: true });
});

app.get('/api/evidence', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all(`SELECT e.*, c.code AS control_code, c.name AS control_name FROM evidence e
    LEFT JOIN controls c ON c.id = e.control_id AND c.tenant_id = e.tenant_id WHERE e.tenant_id = ? ORDER BY e.collected_at DESC`, tid));
});

/* --------------------------------------------------- questionnaires (AI) */

const STOPWORDS = new Set(['do', 'you', 'your', 'the', 'a', 'an', 'is', 'are', 'of', 'and', 'or', 'to', 'in', 'for', 'on', 'how', 'what', 'does', 'have', 'has', 'with', 'we', 'be', 'by', 'at', 'it', 'this', 'that', 'describe', 'please', 'any', 'all', 'from', 'can']);
const tokenize = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));

function knowledgeBase(tid) {
  const statuses = controlStatuses(tid);
  const entries = all('SELECT * FROM controls WHERE tenant_id = ?', tid).map((c) => {
    const st = statuses.get(c.id) || { status: 'no_tests', tests: 0 };
    return {
      kind: 'control', title: `${c.code} ${c.name}`, source: `Control ${c.code}`,
      text: `${c.name}. ${c.description}`, status: st.status, tests: st.tests,
      tokens: tokenize(`${c.name} ${c.description} ${c.category}`),
    };
  });
  for (const p of all("SELECT * FROM policies WHERE tenant_id = ? AND status = 'approved'", tid)) {
    entries.push({
      kind: 'policy', title: p.name, source: p.name, text: p.description,
      status: 'approved', tokens: tokenize(`${p.name} ${p.description} ${p.category}`),
    });
  }
  return entries;
}

function answerQuestion(question, kb) {
  const qTokens = tokenize(question);
  const scored = kb.map((entry) => {
    const overlap = qTokens.filter((t) => entry.tokens.includes(t)).length;
    const coverage = qTokens.length ? overlap / qTokens.length : 0;
    return { entry, score: coverage * 100 + overlap * 4 + (entry.kind === 'control' ? 3 : 0) };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 8) {
    return { answer: null, confidence: 0, source: null, status: 'needs_review' };
  }
  const supporting = scored.slice(0, 3).filter((s) => s.score > 6);
  const ctls = supporting.filter((s) => s.entry.kind === 'control');
  const passing = ctls.filter((c) => c.entry.status === 'passing');
  const openEnded = /^(describe|what|how|which|where|when|why|explain|provide|list)\b/i.test(question.trim());
  const affirm = openEnded ? '' : 'Yes. ';
  const lead = best.entry.kind === 'control'
    ? `${affirm}${best.entry.text}`
    : `${affirm}This is governed by our ${best.entry.title}, which is approved by management and reviewed at least annually. ${best.entry.text}`;
  const evidence = ctls.length
    ? ` Supporting controls: ${ctls.map((c) => c.entry.title).join('; ')}.`
    : '';
  const monitoring = passing.length
    ? ` These controls are monitored continuously in Vantage and ${passing.reduce((a, c) => a + c.entry.tests, 0)} automated tests are currently passing.`
    : ' Evidence for this control is collected and reviewed manually each period.';
  const confidence = Math.max(35, Math.min(97, Math.round(best.score)));
  return {
    answer: `${lead}${evidence}${monitoring}`,
    confidence,
    source: best.entry.source,
    status: confidence >= 70 ? 'answered' : 'needs_review',
  };
}

app.get('/api/questionnaires', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all(`SELECT q.*,
      (SELECT COUNT(*) FROM questionnaire_items i WHERE i.questionnaire_id = q.id) AS total,
      (SELECT COUNT(*) FROM questionnaire_items i WHERE i.questionnaire_id = q.id AND i.status != 'unanswered') AS answered
    FROM questionnaires q WHERE q.tenant_id = ? ORDER BY q.due_date`, tid));
});

app.get('/api/questionnaires/:id', (req, res) => {
  const tid = req.user.tenant_id;
  const q = get('SELECT * FROM questionnaires WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'Questionnaire not found' });
  res.json({ ...q, items: all('SELECT * FROM questionnaire_items WHERE tenant_id = ? AND questionnaire_id = ? ORDER BY id', tid, q.id) });
});

app.post('/api/questionnaires/:id/autofill', (req, res) => {
  const tid = req.user.tenant_id;
  const q = get('SELECT * FROM questionnaires WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'Questionnaire not found' });
  const kb = knowledgeBase(tid);
  const items = all("SELECT * FROM questionnaire_items WHERE tenant_id = ? AND questionnaire_id = ? AND status = 'unanswered'", tid, q.id);
  let filled = 0;
  for (const item of items) {
    const result = answerQuestion(item.question, kb);
    if (!result.answer) continue;
    run('UPDATE questionnaire_items SET answer = ?, confidence = ?, source = ?, status = ? WHERE id = ? AND tenant_id = ?',
      result.answer, result.confidence, result.source, result.status, item.id, tid);
    filled++;
  }
  const remaining = get("SELECT COUNT(*) AS n FROM questionnaire_items WHERE tenant_id = ? AND questionnaire_id = ? AND status = 'unanswered'", tid, q.id).n;
  run('UPDATE questionnaires SET status = ? WHERE id = ? AND tenant_id = ?', remaining === 0 ? 'in_progress' : q.status, q.id, tid);
  logActivity('questionnaire', req.user.name, `Auto-answered ${filled} questions for "${q.name}" (${q.company})`, tid);
  res.json({ filled, remaining });
});

app.patch('/api/questionnaire-items/:id', (req, res) => {
  const tid = req.user.tenant_id;
  const item = get('SELECT * FROM questionnaire_items WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const { answer, status } = req.body || {};
  if (answer !== undefined) run('UPDATE questionnaire_items SET answer = ?, status = ? WHERE id = ? AND tenant_id = ?', answer, 'answered', item.id, tid);
  if (status) run('UPDATE questionnaire_items SET status = ? WHERE id = ? AND tenant_id = ?', status, item.id, tid);
  res.json({ ok: true });
});

/* ----------------------------------------------------- trust center admin */

app.get('/api/trust', (req, res) => {
  const tid = req.user.tenant_id;
  res.json({
    settings: setting('trust_center', null, tid),
    company: setting('company', null, tid),
    documents: all('SELECT * FROM trust_documents WHERE tenant_id = ? ORDER BY name', tid).map((d) => ({ ...d, gated: !!d.gated })),
    requests: all('SELECT * FROM trust_requests WHERE tenant_id = ? ORDER BY created_at DESC', tid),
  });
});

app.patch('/api/trust', requireAdmin, (req, res) => {
  const tid = req.user.tenant_id;
  const current = setting('trust_center', null, tid);
  setSetting('trust_center', { ...current, ...req.body }, tid);
  logActivity('trust_center', req.user.name, 'Updated Trust Center settings', tid);
  res.json({ ok: true, settings: setting('trust_center', null, tid) });
});

app.patch('/api/trust/documents/:id', requireAdmin, (req, res) => {
  const tid = req.user.tenant_id;
  const d = get('SELECT * FROM trust_documents WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Document not found' });
  if (req.body?.gated !== undefined) run('UPDATE trust_documents SET gated = ? WHERE id = ? AND tenant_id = ?', req.body.gated ? 1 : 0, d.id, tid);
  res.json({ ok: true });
});

app.post('/api/trust/requests/:id/:action', (req, res) => {
  const tid = req.user.tenant_id;
  const r = get('SELECT * FROM trust_requests WHERE tenant_id = ? AND id = ?', tid, Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Request not found' });
  const status = req.params.action === 'approve' ? 'approved' : 'denied';
  run('UPDATE trust_requests SET status = ? WHERE id = ? AND tenant_id = ?', status, r.id, tid);
  logActivity('trust_center', req.user.name, `${status === 'approved' ? 'Approved' : 'Denied'} document access for ${r.company}`, tid);
  res.json({ ok: true, status });
});

/* --------------------------------------------------------------- general */

app.get('/api/activity', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all('SELECT * FROM activity WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100', tid));
});

app.get('/api/users', (req, res) => {
  const tid = req.user.tenant_id;
  res.json(all('SELECT id, name, email, role, title FROM users WHERE tenant_id = ? ORDER BY name', tid));
});

app.get('/api/settings', (req, res) => {
  const tid = req.user.tenant_id;
  res.json({ company: setting('company', null, tid), trust_center: setting('trust_center', null, tid) });
});

app.patch('/api/settings', requireAdmin, (req, res) => {
  const tid = req.user.tenant_id;
  if (req.body?.company) setSetting('company', { ...setting('company', null, tid), ...req.body.company }, tid);
  if (req.body?.trust_center) setSetting('trust_center', { ...setting('trust_center', null, tid), ...req.body.trust_center }, tid);
  res.json({ company: setting('company', null, tid), trust_center: setting('trust_center', null, tid) });
});

app.post('/api/demo/reset', requireAdmin, (req, res) => {
  if (PRODUCTION) {
    return res.status(403).json({ error: 'Demo reset is disabled in production mode' });
  }
  if (process.env.VANTAGE_ALLOW_DEMO_RESET === '0') {
    return res.status(403).json({ error: 'Demo reset is disabled in this environment' });
  }
  const { email, name } = req.user;
  seed({ force: true });
  resetSchedule.markRun();
  persistLastReset(resetSchedule.last_reset_at);
  const user = get('SELECT * FROM users WHERE tenant_id = ? AND email = ?', DEMO_TENANT_ID, email);
  let token = null;
  if (user) {
    token = randomUUID();
    run('INSERT INTO sessions (token, user_id, tenant_id, expires_at) VALUES (?, ?, ?, ?)',
      token, user.id, DEMO_TENANT_ID, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  }
  logActivity('system', name, 'Reset the demo environment to its initial state', DEMO_TENANT_ID);
  res.json({ ok: true, token });
});

/* ------------------------------------------------------------ static site */

if (existsSync(dist)) {
  app.use(staticFiles(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(join(dist, 'index.html')));
} else {
  app.get('/', (req, res) => res.status(503).send('<h1>Vantage</h1><p>Frontend not built. Run <code>npm run build</code>.</p>'));
}

setInterval(() => {
  sweepExpired(loginAttempts, Date.now(), LOGIN_WINDOW_MS, LOGIN_MAX_TRACKED_KEYS);
}, 60_000).unref?.();

const INTERVAL_MINUTES = Number(process.env.VANTAGE_SCAN_MINUTES || 60);
if (!PRODUCTION) {
  setInterval(() => {
    try { runTests({ actor: 'Vantage Agent', tenantId: DEMO_TENANT_ID }); } catch (err) { console.error('scan failed', err); }
  }, INTERVAL_MINUTES * 60000).unref?.();
}

if (resetSchedule.enabled) {
  console.log(`[vantage] shared demo data resets every ${resetSchedule.interval_minutes} minutes`);
  setInterval(() => {
    if (!resetSchedule.due()) return;
    try {
      seed({ force: true });
      resetSchedule.markRun();
      persistLastReset(resetSchedule.last_reset_at);
      logActivity('system', 'Vantage', 'Restored the shared demonstration data to its initial state', DEMO_TENANT_ID);
      console.log(`[vantage] shared demo data reset; next ${resetSchedule.next_reset_at}`);
    } catch (err) {
      console.error('[vantage] scheduled demo reset failed:', err?.stack || err);
    }
  }, 60_000).unref?.();
}

process.on('unhandledRejection', (reason) => {
  console.error('[vantage] unhandled rejection:', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[vantage] uncaught exception, exiting for restart:', err?.stack || err);
  process.exit(1);
});

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\n  Vantage ${RELEASE.version} (${RELEASE.release_sha}) listening on ${HOST}:${PORT}`);
  console.log(`  Mode              ${PRODUCTION ? 'PRODUCTION' : 'demo'}`);
  console.log(`  Health            http://127.0.0.1:${PORT}/healthz`);
  console.log(`  Readiness         http://127.0.0.1:${PORT}/readyz`);
  console.log(`  Trust Center      http://127.0.0.1:${PORT}/trust`);
  console.log(`  Database          ${DB_PATH}\n`);
});
