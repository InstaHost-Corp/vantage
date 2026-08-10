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
