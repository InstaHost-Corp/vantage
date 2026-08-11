// Guards for running Vantage as a free, ungated public demonstration.
//
// Until now the only thing standing between this process and the internet was
// Cloudflare Access. Serving the tool publicly moves that responsibility into
// the application: every guard here exists because the process itself is now
// the first thing an anonymous request meets.
//
// Everything is a pure function or an injectable-clock factory so the same
// logic that runs in production is exercised directly by the unit tests.

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export const boolEnv = (value, fallback = false) =>
  (value === undefined || value === '' ? fallback : TRUTHY.has(String(value).toLowerCase()));

export const numEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * The origin sits behind a Cloudflare tunnel, so every socket address is the
 * tunnel's. Only trust a forwarded address when the deployment says the hop in
 * front is trustworthy — otherwise any client could forge its own rate-limit
 * identity by setting a header.
 */
export function clientIp(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const cf = req.headers?.['cf-connecting-ip'];
    if (cf) return String(cf).split(',')[0].trim();
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window counter per key. The map is bounded: an attacker rotating source
 * addresses must not be able to grow it without limit, so it is swept of
 * expired entries and, in the worst case, cleared outright.
 */
export function createRateLimiter({ windowMs, max, maxKeys = 20000, now = Date.now } = {}) {
  const hits = new Map();

  const sweep = (t) => {
    for (const [key, entry] of hits) {
      if (t - entry.start >= windowMs) hits.delete(key);
    }
  };

  return {
    windowMs,
    max,
    size: () => hits.size,
    clear: () => hits.clear(),
    check(key) {
      const t = now();
      if (hits.size >= maxKeys) {
        sweep(t);
        if (hits.size >= maxKeys) hits.clear();
      }
      const entry = hits.get(key);
      if (!entry || t - entry.start >= windowMs) {
        hits.set(key, { start: t, count: 1 });
        return { allowed: true, remaining: max - 1, retry_after_seconds: 0 };
      }
      entry.count += 1;
      const retry = Math.max(1, Math.ceil((entry.start + windowMs - t) / 1000));
      return {
        allowed: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        retry_after_seconds: retry,
      };
    },
  };
}

// Requests that re-evaluate the whole monitoring suite, rewrite the tenant or
// run the questionnaire matcher cost orders of magnitude more than a read, so
// they get their own small budget rather than sharing the write budget.
const HEAVY = [
  /^\/api\/tests\/run\/?$/,
  /^\/api\/tests\/[^/]+\/run\/?$/,
  /^\/api\/tests\/[^/]+\/remediate\/?$/,
  /^\/api\/questionnaires\/[^/]+\/autofill\/?$/,
  /^\/api\/demo\/reset\/?$/,
];

export function classify(method, path) {
  if (method === 'POST' && /^\/api\/auth\/login\/?$/.test(path)) return 'auth';
  if (method === 'POST' && /^\/api\/public\/trust\/request\/?$/.test(path)) return 'contact';
  if (HEAVY.some((re) => re.test(path))) return 'heavy';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  return 'write';
}

export const DEFAULT_TIERS = {
  read: { windowMs: 60_000, max: 240 },
  write: { windowMs: 60_000, max: 60 },
  heavy: { windowMs: 60_000, max: 12 },
  auth: { windowMs: 900_000, max: 30 },
  contact: { windowMs: 3_600_000, max: 5 },
  // A ceiling across every tier, so a client cannot spend each budget in full
  // at once and still flood the process.
  all: { windowMs: 60_000, max: 300 },
};

/**
 * Express-shaped middleware. Only /api is limited: /healthz and /readyz are the
 * monitoring path and static assets are served by the edge cache.
 */
export function rateLimit({ tiers = DEFAULT_TIERS, trustProxy = false, now = Date.now, enabled = true } = {}) {
  const limiters = Object.fromEntries(
    Object.entries(tiers).map(([name, config]) => [name, createRateLimiter({ ...config, now })]),
  );

  const middleware = (req, res, next) => {
    if (!enabled || !req.path?.startsWith('/api')) return next();
    const ip = clientIp(req, { trustProxy });
    const tier = classify(req.method, req.path);
    for (const name of ['all', tier]) {
      const limiter = limiters[name];
      if (!limiter) continue;
      const verdict = limiter.check(`${name}:${ip}`);
      if (!verdict.allowed) {
        res.set('retry-after', String(verdict.retry_after_seconds));
        return res.status(429).json({
          error: 'Too many requests. This is a shared free demonstration — please slow down.',
          retry_after_seconds: verdict.retry_after_seconds,
        });
      }
    }
    return next();
  };

  middleware.limiters = limiters;
  return middleware;
}

/**
 * Headers are applied to every response, including the ones served by the
 * static handler. The CSP matches what the Vite build actually emits: an
 * external module script and stylesheet, an inline `style` attribute from
 * React, and a data: URI favicon.
 */
export function securityHeaders({ hsts = false } = {}) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return (req, res, next) => {
    res.set('content-security-policy', csp);
    res.set('x-content-type-options', 'nosniff');
    res.set('x-frame-options', 'DENY');
    res.set('referrer-policy', 'strict-origin-when-cross-origin');
    res.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.set('cross-origin-opener-policy', 'same-origin');
    res.set('cross-origin-resource-policy', 'same-origin');
    if (hsts || String(req.headers?.['x-forwarded-proto'] || '').includes('https')) {
      res.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

/**
 * A shared demonstration that anybody may change needs to heal itself, so the
 * tenant is reseeded on a fixed cadence. The schedule is a value rather than a
 * timer so the tests can advance it deterministically.
 */
export function createResetSchedule({ intervalMinutes = 0, now = Date.now } = {}) {
  const intervalMs = Math.max(0, intervalMinutes) * 60_000;
  let last = now();
  return {
    enabled: intervalMs > 0,
    interval_minutes: intervalMinutes,
    get last_reset_at() { return new Date(last).toISOString(); },
    get next_reset_at() { return intervalMs ? new Date(last + intervalMs).toISOString() : null; },
    due(at = now()) { return intervalMs > 0 && at - last >= intervalMs; },
    markRun(at = now()) { last = at; },
  };
}

// Free-text fields reachable without an account are the one place an anonymous
// client can write to the database, so every one of them is bounded.
export const FIELD_LIMITS = { name: 120, email: 200, company: 160, document: 200 };

export function sanitizeTrustRequest(body = {}, limits = FIELD_LIMITS) {
  const errors = [];
  const clean = {};
  for (const [field, max] of Object.entries(limits)) {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!value) errors.push(`${field} is required`);
    else if (value.length > max) errors.push(`${field} must be ${max} characters or fewer`);
    else clean[field] = value;
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean.email)) {
    errors.push('email must be a valid address');
  }
  return { ok: errors.length === 0, value: clean, errors };
}

export function publicModeConfig(env = process.env) {
  const publicDemo = boolEnv(env.VANTAGE_PUBLIC_DEMO, false);
  return {
    publicDemo,
    trustProxy: boolEnv(env.VANTAGE_TRUST_PROXY, publicDemo),
    rateLimit: boolEnv(env.VANTAGE_RATE_LIMIT, true),
    hsts: boolEnv(env.VANTAGE_HSTS, false),
    // Reseeding is destructive, so it is only ever on by default where the data
    // is deliberately disposable: the public demonstration.
    resetMinutes: numEnv(env.VANTAGE_DEMO_RESET_MINUTES, publicDemo ? 360 : 0),
    maxPendingTrustRequests: numEnv(env.VANTAGE_MAX_PENDING_TRUST_REQUESTS, 200),
    sourceUrl: env.VANTAGE_SOURCE_URL || 'https://github.com/phamid/vantage',
  };
}
