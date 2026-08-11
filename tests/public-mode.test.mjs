// Unit coverage for the guards that make an ungated public deployment safe.
// These run without a server: every guard is a pure function or an
// injectable-clock factory precisely so it can be proven here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, clientIp, createRateLimiter, createResetSchedule, publicModeConfig,
  sanitizeTrustRequest, securityHeaders,
} from '../server/public-mode.js';

const fakeRes = () => {
  const headers = {};
  return { headers, set(name, value) { headers[name.toLowerCase()] = value; return this; } };
};

test('a forwarded address is only trusted when the deployment says so', () => {
  const req = {
    headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.4, 10.0.0.1' },
    socket: { remoteAddress: '10.1.2.3' },
  };
  assert.equal(clientIp(req, { trustProxy: true }), '203.0.113.9');
  // Without the trust flag a client could pick its own rate-limit identity.
  assert.equal(clientIp(req, { trustProxy: false }), '10.1.2.3');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }, socket: {} }, { trustProxy: true }), '198.51.100.4');
  assert.equal(clientIp({ headers: {}, socket: {} }, { trustProxy: true }), 'unknown');
});

test('the fixed window refuses over-budget requests and reopens after it expires', () => {
  let clock = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: () => clock });

  assert.deepEqual([1, 2, 3].map(() => limiter.check('a').allowed), [true, true, true]);
  const refused = limiter.check('a');
  assert.equal(refused.allowed, false);
  assert.ok(refused.retry_after_seconds > 0 && refused.retry_after_seconds <= 60);

  // A different client is unaffected by a noisy one.
  assert.equal(limiter.check('b').allowed, true);

  clock += 60_001;
  assert.equal(limiter.check('a').allowed, true);
});

test('the counter map stays bounded when an attacker rotates source addresses', () => {
  let clock = 0;
  const limiter = createRateLimiter({ windowMs: 1_000, max: 5, maxKeys: 50, now: () => clock });
  for (let i = 0; i < 500; i++) {
    clock += 1;
    limiter.check(`ip-${i}`);
  }
  assert.ok(limiter.size() <= 50, `unbounded growth: ${limiter.size()} keys retained`);
});

test('expensive and anonymous-write routes get their own budgets', () => {
  assert.equal(classify('GET', '/api/dashboard'), 'read');
  assert.equal(classify('PATCH', '/api/risks/R-001'), 'write');
  assert.equal(classify('POST', '/api/tests/run'), 'heavy');
  assert.equal(classify('POST', '/api/tests/aws-s3-encryption/remediate'), 'heavy');
  assert.equal(classify('POST', '/api/questionnaires/3/autofill'), 'heavy');
  assert.equal(classify('POST', '/api/demo/reset'), 'heavy');
  assert.equal(classify('POST', '/api/auth/login'), 'auth');
  assert.equal(classify('POST', '/api/public/trust/request'), 'contact');
});

test('security headers deny framing and only assert HSTS over TLS', () => {
  const plain = fakeRes();
  securityHeaders()({ headers: {} }, plain, () => {});
  assert.equal(plain.headers['x-frame-options'], 'DENY');
  assert.equal(plain.headers['x-content-type-options'], 'nosniff');
  assert.match(plain.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(plain.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(plain.headers['strict-transport-security'], undefined);

  const tls = fakeRes();
  securityHeaders()({ headers: { 'x-forwarded-proto': 'https' } }, tls, () => {});
  assert.match(tls.headers['strict-transport-security'], /max-age=31536000/);
});

test('the shared demonstration heals itself on a cadence', () => {
  let clock = 0;
  const schedule = createResetSchedule({ intervalMinutes: 360, now: () => clock });
  assert.equal(schedule.enabled, true);
  assert.equal(schedule.due(), false);

  clock += 359 * 60_000;
  assert.equal(schedule.due(), false);
  clock += 2 * 60_000;
  assert.equal(schedule.due(), true);

  schedule.markRun();
  assert.equal(schedule.due(), false);
  assert.equal(schedule.next_reset_at, new Date(clock + 360 * 60_000).toISOString());
});

test('reseeding is off unless the deployment asks for it', () => {
  assert.equal(createResetSchedule({ intervalMinutes: 0 }).enabled, false);
  assert.equal(createResetSchedule({ intervalMinutes: 0 }).next_reset_at, null);
  // A private self-hosted install must never wipe its own data on a timer.
  assert.equal(publicModeConfig({}).resetMinutes, 0);
  assert.equal(publicModeConfig({}).publicDemo, false);
  assert.equal(publicModeConfig({ VANTAGE_PUBLIC_DEMO: '1' }).resetMinutes, 360);
  assert.equal(publicModeConfig({ VANTAGE_PUBLIC_DEMO: '1' }).trustProxy, true);
  assert.equal(publicModeConfig({ VANTAGE_PUBLIC_DEMO: '1', VANTAGE_DEMO_RESET_MINUTES: '0' }).resetMinutes, 0);
});

test('the one anonymous write path is bounded and validated', () => {
  const valid = sanitizeTrustRequest({
    name: ' Jamie Fox ', email: 'jamie@example.com', company: 'Example Ltd', document: 'SOC 2 Type II Report',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.name, 'Jamie Fox');

  assert.equal(sanitizeTrustRequest({ name: 'x' }).ok, false);
  assert.equal(sanitizeTrustRequest({ name: 'x', email: 'nope', company: 'c', document: 'd' }).ok, false);

  const oversized = sanitizeTrustRequest({
    name: 'a'.repeat(5000), email: 'jamie@example.com', company: 'Example', document: 'SOC 2',
  });
  assert.equal(oversized.ok, false);
  assert.match(oversized.errors[0], /characters or fewer/);
});
