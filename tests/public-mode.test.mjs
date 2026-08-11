// Unit coverage for the guards that make an ungated public deployment safe.
// These run without a server: every guard is a pure function or an
// injectable-clock factory precisely so it can be proven here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anonymizeTrustRequest, classify, clientIp, createRateLimiter, createResetSchedule,
  publicModeConfig, readinessDetailAllowed, sanitizeTrustRequest, securityHeaders,
  throttleKeyFor,
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
  assert.equal(publicModeConfig({ VANTAGE_PUBLIC_DEMO: '1' }).resetMinutes, 1440, 'the public demonstration resets daily');
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

test('a real visitor identity never reaches the shared queue', () => {
  const submitted = { name: 'Jamie Fox', email: 'jamie@realcompany.com', company: 'Real Company Ltd', document: 'SOC 2 Type II Report' };

  const onDemo = anonymizeTrustRequest(submitted, { publicDemo: true, counter: 7 });
  assert.equal(onDemo.anonymized, true);
  assert.equal(onDemo.document, 'SOC 2 Type II Report', 'the requested document is not personal data and must survive');
  const stored = JSON.stringify(onDemo);
  for (const personal of ['Jamie Fox', 'jamie@realcompany.com', 'Real Company Ltd']) {
    assert.ok(!stored.includes(personal), `submitted identity leaked into the shared queue: ${personal}`);
  }
  assert.match(onDemo.email, /@example\.invalid$/);

  // Negative control: a private self-hosted instance is a real workflow and
  // must keep the requester it was given.
  const selfHosted = anonymizeTrustRequest(submitted, { publicDemo: false });
  assert.equal(selfHosted.anonymized, false);
  assert.equal(selfHosted.name, 'Jamie Fox');
  assert.equal(selfHosted.email, 'jamie@realcompany.com');
});

test('readiness detail is served to origin monitoring and withheld from the public', () => {
  const from = (address) => ({ socket: { remoteAddress: address } });
  assert.equal(readinessDetailAllowed(from('127.0.0.1'), {}), true);
  assert.equal(readinessDetailAllowed(from('::ffff:127.0.0.1'), {}), true);
  assert.equal(readinessDetailAllowed(from('::1'), {}), true);
  // Anything arriving through the tunnel is an anonymous public caller.
  assert.equal(readinessDetailAllowed(from('172.16.41.1'), {}), false);
  assert.equal(readinessDetailAllowed(from('203.0.113.9'), {}), false);
  assert.equal(readinessDetailAllowed(from('203.0.113.9'), { VANTAGE_READYZ_DETAIL: '1' }), true);
});

test('the sign-in throttle identifies a client without keeping what they typed', () => {
  const ip = '203.0.113.4';
  const typed = 'real.person@theiremployer.example';
  const key = throttleKeyFor(ip, typed);

  // It must still tell attempts apart, or the throttle does not work.
  assert.equal(key, throttleKeyFor(ip, typed), 'the same client and account must map to the same key');
  assert.notEqual(key, throttleKeyFor(ip, 'someone.else@example.com'));
  assert.notEqual(key, throttleKeyFor('198.51.100.9', typed));
  assert.equal(throttleKeyFor(ip, 'REAL.Person@TheirEmployer.Example  '), key, 'case and padding must not split the budget');

  // And it must not retain the address a visitor typed by habit, nor their IP.
  assert.ok(!key.includes(typed), 'the typed address is retained in the throttle key');
  assert.ok(!key.includes('theiremployer'), 'the typed domain is retained in the throttle key');
  assert.ok(!key.includes(ip), 'the client address is retained in the throttle key');
  assert.match(key, /^[0-9a-f]{32}$/, 'the key should be an opaque digest');

  assert.equal(throttleKeyFor(ip, ''), throttleKeyFor(ip, undefined), 'a missing account is one bucket, not many');
});
