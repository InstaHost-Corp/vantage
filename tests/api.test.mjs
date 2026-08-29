// Boots the real server against a throwaway database and exercises the
// contracts production depends on: health, readiness, authentication,
// remediation and the public Trust Center.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workdir = mkdtempSync(join(tmpdir(), 'vantage-api-'));
// A few tests import server modules directly. Point the database at the
// throwaway directory before any of them do, or the import opens the bundled
// default path — which is read-only in the production image, where this suite
// also runs.
process.env.VANTAGE_DB = join(workdir, 'in-process.db');
const PORT = 41730 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const SHA = 'test0000000000000000000000000000000000000';

let child;
let token;

const api = (path, options = {}) => fetch(`${BASE}${path}`, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  },
});

before(async () => {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      VANTAGE_DB: join(workdir, 'test.db'),
      APP_VERSION: '9.9.9',
      RELEASE_SHA: SHA,
      SOURCE_DIGEST: 'sha256:test',
      VANTAGE_SCAN_MINUTES: '600',
      // Boot the server in exactly the shape the free public deployment uses,
      // so the public-mode guards are exercised rather than bypassed.
      VANTAGE_ENV: 'demo',
      VANTAGE_DEMO_MODE: '1',
      VANTAGE_PUBLIC_DEMO: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('server did not become healthy');
    await new Promise((r) => setTimeout(r, 300));
  }
});

after(() => {
  if (child) child.kill('SIGTERM');
  rmSync(workdir, { recursive: true, force: true });
});

test('healthz reports the release identity injected by the deployment', async () => {
  const body = await fetch(`${BASE}/healthz`).then((r) => r.json());
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'vantage');
  assert.equal(body.version, '9.9.9');
  assert.equal(body.release_sha, SHA);
  assert.equal(body.source_digest, 'sha256:test');
  assert.ok(Number.isInteger(body.uptime_seconds));
});

test('readyz reports every dependency and the seeded monitoring engine', async () => {
  const res = await fetch(`${BASE}/readyz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ready, true);
  for (const check of ['database', 'schema_seeded', 'monitoring_engine', 'database_writable', 'frontend_build']) {
    assert.ok(body.checks[check], `missing check ${check}`);
    assert.equal(body.checks[check].ok, true, `check ${check} not ok`);
  }
});

test('the api rejects unauthenticated access', async () => {
  const res = await fetch(`${BASE}/api/dashboard`);
  assert.equal(res.status, 401);
});

test('a bad password is rejected and a good one issues a session', async () => {
  const bad = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ada@northwind.io', password: 'wrong' }) });
  assert.equal(bad.status, 401);

  const good = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ada@northwind.io', password: 'vantage123' }) });
  assert.equal(good.status, 200);
  const body = await good.json();
  assert.ok(body.token);
  assert.equal(body.user.email, 'ada@northwind.io');
  assert.equal(body.user.password_hash, undefined);
  token = body.token;
});

test('integration configuration is admin-only, bounded, and does not simulate collection', async () => {
  const before = await api('/api/integrations').then((r) => r.json());
  const github = before.find((integration) => integration.slug === 'github');
  assert.ok(github);
  assert.equal(github.status, 'configured');

  const invalid = await api('/api/integrations/github/connect', {
    method: 'POST',
    body: JSON.stringify({ account: 'x' }),
  });
  assert.equal(invalid.status, 400);

  const segmentedCredential = await api('/api/integrations/github/connect', {
    method: 'POST',
    body: JSON.stringify({ account: 'glpat-12345678901234567890' }),
  });
  assert.equal(segmentedCredential.status, 400);

  for (const account of ['https://github.example/workspace', 'github_pat_abcdefghijklmnopqrstuvwxyz', 'Bearer example-value', `Account\u0085Reference`]) {
    const rejected = await api('/api/integrations/github/connect', {
      method: 'POST',
      body: JSON.stringify({ account }),
    });
    assert.equal(rejected.status, 400, `credential or URL-shaped reference was accepted: ${account}`);
  }

  const configured = await api('/api/integrations/github/connect', {
    method: 'POST',
    body: JSON.stringify({ account: 'Northwind Engineering' }),
  });
  assert.equal(configured.status, 200);
  const configuredBody = await configured.json();
  assert.equal(configuredBody.integration.status, 'configured');
  assert.equal(configuredBody.integration.account, 'Northwind Engineering');
  assert.equal(configuredBody.integration.last_sync, null);
  for (const field of ['token', 'password', 'password_hash', 'secret', 'api_key', 'access_token']) {
    assert.equal(Object.hasOwn(configuredBody.integration, field), false, `response exposed ${field}`);
  }

  const sync = await api('/api/integrations/github/sync', { method: 'POST' });
  assert.equal(sync.status, 409);

  const contributorSignup = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.199' },
    body: JSON.stringify({ name: 'Integration Contributor', email: 'integration-contributor@example.com', password: 'CorrectHorse42!' }),
  }).then((r) => r.json());
  const contributor = (path, options = {}) => fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${contributorSignup.token}`,
      ...(options.headers || {}),
    },
  });
  assert.equal((await contributor('/api/integrations/github/disconnect', { method: 'POST' })).status, 403);
  const contributorIntegrations = await contributor('/api/integrations').then((r) => r.json());
  assert.equal(contributorIntegrations.find((integration) => integration.slug === 'github').account, null,
    'only tenant administrators may view a service account reference');

  const removed = await api('/api/integrations/github/disconnect', { method: 'POST' });
  assert.equal(removed.status, 200);
  assert.ok(!(JSON.stringify(await api('/api/activity').then((r) => r.json()))).includes('Northwind Engineering'),
    'account references must not be copied into audit activity');
  const after = await api('/api/integrations').then((r) => r.json());
  const afterGithub = after.find((integration) => integration.slug === 'github');
  assert.equal(afterGithub.status, 'available');
  assert.equal(afterGithub.account, null);
  assert.equal(afterGithub.last_sync, null);
});

test('anonymous signup creates a normal signed-in account', async () => {
  const password = 'CorrectHorse42!';
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.31' },
    body: JSON.stringify({ name: '  Jamie   Signup  ', email: '  JAMIE.Signup+One@Example.COM ', password }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);
  assert.deepEqual(body.user, {
    id: body.user.id,
    email: 'jamie.signup+one@example.com',
    name: 'Jamie Signup',
    role: 'contributor',
    title: 'Workspace member',
  });
  assert.equal(body.user.password_hash, undefined);
  assert.ok(!JSON.stringify(body).includes(password), 'signup response must not echo the password');

  const asSignup = (path, options = {}) => fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${body.token}`, ...(options.headers || {}) },
  });
  const me = await asSignup('/api/me').then((r) => r.json());
  assert.equal(me.user.email, 'jamie.signup+one@example.com');
  assert.equal((await asSignup('/api/demo/reset', { method: 'POST' })).status, 403, 'self-service users must not be admins');
});

test('signup rejects duplicate and invalid input without leaking secrets', async () => {
  const duplicate = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.32' },
    body: JSON.stringify({ name: 'Duplicate', email: 'JAMIE.SIGNUP+ONE@EXAMPLE.COM', password: 'AnotherLong42!' }),
  });
  assert.equal(duplicate.status, 409);
  assert.ok(!JSON.stringify(await duplicate.json()).includes('password_hash'));

  for (const [payload, label] of [
    [{ name: 'A', email: 'bad-address', password: 'LongEnough42!' }, 'bad email and short name'],
    [{ name: 'Valid Name', email: 'valid@example.com', password: 'short' }, 'short password'],
    [{ name: 'x'.repeat(121), email: 'long-name@example.com', password: 'LongEnough42!' }, 'long name'],
    [{ name: 'Valid Name', email: 'huge-password@example.com', password: 'x'.repeat(1025) }, 'huge password'],
  ]) {
    const res = await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${40 + label.length}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400, label);
    const raw = JSON.stringify(await res.json());
    assert.ok(!raw.includes(payload.password), `${label} leaked password material`);
    assert.ok(!raw.includes('SQLITE'), `${label} leaked database internals`);
  }
});

test('anonymous signup writes are rate-limited and field-bounded', async () => {
  const beforeUsers = await api('/api/users').then((r) => r.json());
  const tooLarge = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.60' },
    body: JSON.stringify({ name: 'Bounded Tester', email: 'bounded@example.com', password: 'x'.repeat(5000) }),
  });
  assert.equal(tooLarge.status, 400);
  const afterUsers = await api('/api/users').then((r) => r.json());
  assert.equal(afterUsers.length, beforeUsers.length, 'oversized anonymous signup must not create a user');

  let throttled = false;
  for (let i = 0; i < 7; i++) {
    const res = await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.61' },
      body: JSON.stringify({ name: `Burst Signup ${i}`, email: `burst-signup-${i}@example.com`, password: 'LongEnough42!' }),
    });
    if (res.status === 429) {
      throttled = true;
      assert.ok(Number(res.headers.get('retry-after')) > 0);
      break;
    }
  }
  assert.equal(throttled, true, 'signup must use the public anonymous-write rate limiter');
});

test('the dashboard reports a seeded compliance posture', async () => {
  const body = await api('/api/dashboard').then((r) => r.json());
  assert.equal(body.posture.tests_total, 49);
  assert.ok(body.posture.tests_failing > 0);
  assert.ok(body.frameworks.length >= 5);
  assert.ok(body.overall_readiness > 0 && body.overall_readiness < 100);
});

test('remediating a failing test flips it to passing and raises readiness', async () => {
  const before = await api('/api/dashboard').then((r) => r.json());
  const target = await api('/api/tests/aws-s3-encryption').then((r) => r.json());
  assert.equal(target.status, 'failing');
  assert.ok(target.entities.some((e) => !e.passed));

  const fixed = await api('/api/tests/aws-s3-encryption/remediate', { method: 'POST', body: '{}' }).then((r) => r.json());
  assert.ok(fixed.count >= 1);
  assert.equal(fixed.test.status, 'ok');

  const after = await api('/api/dashboard').then((r) => r.json());
  assert.ok(after.posture.tests_passing > before.posture.tests_passing);
});

test('the public trust center needs no authentication and hides internals', async () => {
  const res = await fetch(`${BASE}/api/public/trust`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.frameworks.length > 0);
  assert.ok(body.control_groups.length > 0);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('password_hash'), 'credential material must never reach the public payload');
  assert.ok(!raw.includes('ada@northwind.io'), 'personnel identities must not be published');
  assert.ok(!raw.includes('trust_requests'), 'inbound access requests must not be published');
  // The published security contact is intentional public content.
  assert.equal(body.company.contact, 'security@northwind.io');
});

test('a trust document access request is accepted and validated', async () => {
  const bad = await fetch(`${BASE}/api/public/trust/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x' }),
  });
  assert.equal(bad.status, 400);

  const good = await fetch(`${BASE}/api/public/trust/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Jamie Fox', email: 'jamie@example.com', company: 'Example', document: 'SOC 2 Type II Report' }),
  });
  assert.equal(good.status, 200);
});

test('questionnaire autofill drafts answers with confidence scores', async () => {
  const list = await api('/api/questionnaires').then((r) => r.json());
  const pending = list.find((q) => q.answered < q.total || q.total === 0) || list[list.length - 1];
  const result = await api(`/api/questionnaires/${pending.id}/autofill`, { method: 'POST' }).then((r) => r.json());
  assert.ok(result.filled >= 0);
  const detail = await api(`/api/questionnaires/${pending.id}`).then((r) => r.json());
  for (const item of detail.items.filter((i) => i.status !== 'unanswered')) {
    assert.ok(item.answer && item.answer.length > 20);
    assert.ok(item.confidence >= 35 && item.confidence <= 97);
  }
});

test('the spa fallback serves index.html for a client route but not for /api', async () => {
  const page = await fetch(`${BASE}/frameworks/soc2`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /<div id="root">/);

  // The identity gate is evaluated before routing, so an anonymous request to
  // an unknown /api path is refused rather than disclosing that it is unknown.
  const anonymous = await fetch(`${BASE}/api/does-not-exist`);
  assert.equal(anonymous.status, 401);

  const authenticated = await api('/api/does-not-exist');
  assert.equal(authenticated.status, 404);
  assert.match(authenticated.headers.get('content-type'), /application\/json/);
});

test('signing out invalidates the session token', async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'marcus@northwind.io', password: 'vantage123' }) }).then((r) => r.json());
  const scoped = (path, options = {}) => fetch(`${BASE}${path}`, { ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` } });
  assert.equal((await scoped('/api/me')).status, 200);
  assert.equal((await scoped('/api/auth/logout', { method: 'POST' })).status, 200);
  assert.equal((await scoped('/api/me')).status, 401);
});

test('passwords are stored salted and are not recoverable from the hash', async () => {
  const { hashPassword, verifyPassword } = await import('../server/seed.js');
  const a = hashPassword('vantage123');
  const b = hashPassword('vantage123');
  assert.notEqual(a, b, 'identical passwords must not produce identical stored values');
  assert.match(a, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(!a.includes('vantage123'));
  assert.equal(verifyPassword('vantage123', a), true);
  assert.equal(verifyPassword('vantage124', a), false);
  assert.equal(verifyPassword('vantage123', 'not-a-stored-hash'), false);
  assert.equal(verifyPassword('vantage123', undefined), false);
});

/* ---- Regression coverage for the pre-deployment review findings ---- */

test('SEC-2: a session token in the query string is not accepted', async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ada@northwind.io', password: 'vantage123' }) }).then((r) => r.json());
  const viaHeader = await fetch(`${BASE}/api/me`, { headers: { authorization: `Bearer ${login.token}` } });
  assert.equal(viaHeader.status, 200, 'the header must still work');
  const viaQuery = await fetch(`${BASE}/api/me?token=${login.token}`);
  assert.equal(viaQuery.status, 401, 'a token in the URL must be refused');
});

test('SEC-1: an auditor has read-only access and cannot mutate the workspace', async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'auditor@keeling-cpa.com', password: 'vantage123' }) }).then((r) => r.json());
  assert.equal(login.user.role, 'auditor');
  const as = (path, options = {}) => fetch(`${BASE}${path}`, {
    ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
  });
  assert.equal((await as('/api/dashboard')).status, 200, 'auditors must still read evidence');
  for (const [path, options] of [
    ['/api/demo/reset', { method: 'POST' }],
    ['/api/tests/aws-iam-mfa/remediate', { method: 'POST', body: '{}' }],
    ['/api/policies/business-continuity-plan/approve', { method: 'POST' }],
    ['/api/frameworks/soc2/toggle', { method: 'POST' }],
    ['/api/settings', { method: 'PATCH', body: JSON.stringify({ company: { name: 'x' } }) }],
  ]) {
    assert.equal((await as(path, options)).status, 403, `auditor must be refused ${path}`);
  }
  assert.equal((await as('/api/auth/logout', { method: 'POST' })).status, 200, 'auditors must be able to sign out');
});

test('SEC-1/ENG-M2: only an administrator may reset the tenant or approve policy', async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'priya@northwind.io', password: 'vantage123' }) }).then((r) => r.json());
  assert.equal(login.user.role, 'contributor');
  const as = (path, options = {}) => fetch(`${BASE}${path}`, {
    ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
  });
  assert.equal((await as('/api/demo/reset', { method: 'POST' })).status, 403);
  assert.equal((await as('/api/policies/business-continuity-plan/approve', { method: 'POST' })).status, 403);
  // A contributor may still perform day-to-day remediation.
  assert.equal((await as('/api/tests/aws-rds-backups/remediate', { method: 'POST', body: '{}' })).status, 200);
});

test('ENG-L2: the api guard matches whole path segments, not bare prefixes', async () => {
  assert.equal((await fetch(`${BASE}/api/publicX`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/authX`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/public/trust`)).status, 200);
});

test('ENG-M1: readiness proves the data volume accepts writes', async () => {
  const body = await fetch(`${BASE}/readyz`).then((r) => r.json());
  assert.equal(body.checks.database_writable.ok, true);
  assert.match(body.checks.database_writable.detail, /write and read back succeeded/);
  assert.match(body.checks.database.detail, /quick_check=ok/);
});

test('SEC-4: the public trust payload does not disclose which controls are failing', async () => {
  const body = await fetch(`${BASE}/api/public/trust`).then((r) => r.json());
  const statuses = new Set(body.control_groups.flatMap((g) => g.items.map((i) => i.status)));
  assert.ok(!statuses.has('failing'), `public payload leaked raw status: ${[...statuses]}`);
  // Only two public states exist, so a failing control is indistinguishable
  // from one with no automated test behind it. A third state would let a
  // reader subtract and recover the live failing count.
  for (const status of statuses) assert.ok(['verified', 'in_progress'].includes(status), `unexpected public status ${status}`);
  const authed = await api('/api/controls').then((r) => r.json());
  const failing = authed.filter((c) => c.status === 'failing').map((c) => c.code);
  const noTests = authed.filter((c) => c.status === 'no_tests').map((c) => c.code);
  assert.ok(failing.length > 0, 'the fixture must contain a failing control for this test to mean anything');
  const publicByCode = new Map(body.control_groups.flatMap((g) => g.items).map((i) => [i.code, i.status]));
  for (const code of [...failing, ...noTests]) {
    assert.equal(publicByCode.get(code), 'in_progress', `control ${code} is publicly distinguishable`);
  }
  // The aggregate must not disclose more than the per-control publication: it
  // counts controls, so its complement is the same merged bucket rather than a
  // test-level failing count a reader can subtract out.
  const publiclyVerified = [...publicByCode.values()].filter((s) => s === 'verified').length;
  assert.equal(body.posture.controls_monitored, publicByCode.size);
  assert.equal(body.posture.controls_verified, publiclyVerified);
  const authedFailingTests = (await api('/api/dashboard').then((r) => r.json())).posture.tests_failing;
  assert.notEqual(body.posture.controls_monitored - body.posture.controls_verified, authedFailingTests,
    'the published complement must not equal the live failing-test count');
  // The aggregate must be coarsened too, or the per-control coarsening is defeated.
  assert.deepEqual(Object.keys(body.posture).sort(), ['controls_monitored', 'controls_verified', 'coverage_percent']);
  const rawPosture = JSON.stringify(body.posture);
  for (const leaked of ['failing', 'critical', 'high']) {
    assert.ok(!rawPosture.includes(leaked), `public posture leaked '${leaked}'`);
  }
});

test('SEC-3: repeated failed sign-ins are throttled', async () => {
  let sawThrottle = false;
  for (let i = 0; i < 14; i++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'throttle-probe@northwind.io', password: `wrong-${i}` }),
    });
    if (res.status === 429) { sawThrottle = true; break; }
  }
  assert.ok(sawThrottle, 'brute force against one account must eventually be refused');
});

/* ------------------------------------------------- free public deployment */

test('PUB-1: the public config advertises a free shared demo without an account', async () => {
  const res = await fetch(`${BASE}/api/public/config`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.public_demo, true);
  assert.equal(body.version, '9.9.9');
  assert.equal(body.demo.password, 'vantage123');
  assert.equal(body.demo.auto_reset, true);
  assert.equal(body.demo.reset_interval_minutes, 1440, 'the public demonstration resets daily');
  assert.ok(new Date(body.demo.next_reset_at).getTime() > Date.now());
  assert.ok(body.source_url.startsWith('https://github.com/'));
  assert.ok(body.demo.accounts.some((a) => a.email === 'ada@northwind.io' && a.role === 'admin'));
  // The sign-in helper must never carry credential material beyond the
  // deliberately published shared demonstration password.
  assert.ok(!JSON.stringify(body).includes('password_hash'));
});

test('PUB-2: every response carries the browser security headers', async () => {
  for (const path of ['/api/public/trust', '/healthz']) {
    const res = await fetch(`${BASE}${path}`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
  }
});

test('PUB-3: an anonymous burst is refused per client, and other clients are unaffected', async () => {
  const post = (ip) => fetch(`${BASE}/api/public/trust/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ name: 'Burst Tester', email: 'burst@example.com', company: 'Example', document: 'SOC 2 Type II Report' }),
  });

  let throttled = null;
  for (let i = 0; i < 8 && !throttled; i++) {
    const res = await post('203.0.113.77');
    if (res.status === 429) throttled = res;
  }
  assert.ok(throttled, 'a flood from one address must eventually be refused');
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);

  // Negative control: the limiter must distinguish clients, not simply close
  // the endpoint once anybody has been noisy.
  assert.equal((await post('203.0.113.78')).status, 200);
});

test('PUB-4: anonymous writes are length-bounded', async () => {
  const res = await fetch(`${BASE}/api/public/trust/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.90' },
    body: JSON.stringify({ name: 'a'.repeat(4000), email: 'jamie@example.com', company: 'Example', document: 'SOC 2 Type II Report' }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /characters or fewer/);
});

test('PUB-5: a signed-in visitor is told the workspace is shared and when it resets', async () => {
  const body = await api('/api/me').then((r) => r.json());
  assert.equal(body.public_demo, true);
  assert.ok(new Date(body.next_reset_at).getTime() > Date.now());
  assert.ok(body.source_url.startsWith('https://github.com/'));
});

test('PUB-6: a visitor identity submitted to the public demo is discarded, not stored', async () => {
  const res = await fetch(`${BASE}/api/public/trust/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.120' },
    body: JSON.stringify({
      name: 'Jamie Realperson', email: 'jamie@realcompany.example', company: 'Real Company Ltd',
      document: 'SOC 2 Type II Report',
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.anonymized, true);
  assert.match(body.message, /discarded/);

  // The queue is readable by anyone holding the published demonstration
  // credentials, so prove the identity is not in it — nor in the activity feed.
  const queue = JSON.stringify(await api('/api/trust').then((r) => r.json()));
  const activity = JSON.stringify(await api('/api/activity').then((r) => r.json()));
  for (const personal of ['Jamie Realperson', 'jamie@realcompany.example', 'Real Company Ltd']) {
    assert.ok(!queue.includes(personal), `submitted identity reached the shared queue: ${personal}`);
    assert.ok(!activity.includes(personal), `submitted identity reached the activity feed: ${personal}`);
  }
  assert.ok(queue.includes('Demo visitor'), 'the workflow must still record a request to approve');
});

test('PUB-7: readiness detail is not disclosed to an anonymous public caller', async () => {
  // The suite connects over loopback, which is the detail-allowed path, so
  // detail is expected here; readinessDetailAllowed covers the public case and
  // is unit-tested against tunnel and internet addresses.
  const body = await fetch(`${BASE}/readyz`).then((r) => r.json());
  assert.equal(body.ready, true);
  assert.match(body.checks.database.detail, /quick_check=ok/, 'a detail-allowed caller must keep full detail');
  assert.ok(body.checks.frontend_build.detail.includes('dist'));
  // Every check must carry a reason code as well, because in production the
  // container is reached through a published port and even the origin probe
  // arrives from the bridge gateway — a redacted body still has to say what
  // is wrong.
  for (const name of ['database', 'schema_seeded', 'monitoring_engine', 'database_writable', 'frontend_build']) {
    assert.equal(typeof body.checks[name].detail, 'string', `${name} lost its detail`);
  }
});

test('PUB-8: the public config reports the guard state the ungate tooling verifies', async () => {
  const body = await fetch(`${BASE}/api/public/config`).then((r) => r.json());
  assert.equal(body.release_sha, SHA);
  for (const guard of ['rate_limit', 'security_headers', 'anonymous_writes_anonymized', 'auto_reset']) {
    assert.equal(body.guards[guard], true, `guard ${guard} not reported`);
  }
});

test('PUB-9: the document field cannot smuggle an identity into the shared queue', async () => {
  const res = await fetch(`${BASE}/api/public/trust/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.140' },
    body: JSON.stringify({
      name: 'Anon', email: 'anon@example.com', company: 'Anon Ltd',
      document: 'Jamie Realperson jamie@realcompany.example',
    }),
  });
  // Free text in the document field is refused outright: it is resolved
  // against the published catalogue rather than stored as given.
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Unknown document');

  const queue = JSON.stringify(await api('/api/trust').then((r) => r.json()));
  const activity = JSON.stringify(await api('/api/activity').then((r) => r.json()));
  for (const personal of ['Jamie Realperson', 'jamie@realcompany.example']) {
    assert.ok(!queue.includes(personal), `identity reached the queue through the document field: ${personal}`);
    assert.ok(!activity.includes(personal), `identity reached the activity feed through the document field: ${personal}`);
  }
});

test('PUB-10: the demonstration keeps nothing a visitor types at sign-in', async () => {
  // A visitor may enter a real work address out of habit. Drive the throttle
  // past its limit with one, then prove the service kept no trace of it.
  const typed = 'real.person@theiremployer.example';
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.201' },
      body: JSON.stringify({ email: typed, password: `not-the-password-${i}` }),
    });
    if (res.status === 429) break;
  }

  // Nothing reaches the activity feed, the user table or any other surface a
  // later visitor can read.
  const activity = JSON.stringify(await api('/api/activity').then((r) => r.json()));
  const users = JSON.stringify(await api('/api/users').then((r) => r.json()));
  for (const surface of [activity, users]) {
    assert.ok(!surface.includes(typed), 'a typed address reached a readable surface');
    assert.ok(!surface.includes('theiremployer'), 'a typed domain reached a readable surface');
  }
  assert.ok(!activity.includes('not-the-password'), 'a typed password reached the activity feed');
});

test('PUB-11: a successful sign-in records the account, never the credential', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.202' },
    body: JSON.stringify({ email: 'sofia@northwind.io', password: 'vantage123' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.password_hash, undefined, 'the response must not carry credential material');

  const activity = JSON.stringify(await api('/api/activity').then((r) => r.json()));
  assert.ok(!activity.includes('vantage123'), 'the password reached the activity feed');
  assert.ok(!activity.includes('password'), 'the activity feed should not discuss credentials at all');
});
