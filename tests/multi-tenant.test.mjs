// Multi-tenant isolation and production-mode tests.
// Proves that two tenants cannot read or update each other's records,
// that production mode disables demo features, and that signup creates
// an isolated tenant.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuntimeConfig } from '../server/runtime.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_COMMIT = '4e596f25a785c5c2917e4a7fa77a2b73b8a95f84';

// -------------------------------------------------------- Demo-mode server
// Boot a server in demo mode so we can test multi-tenant isolation.
const demoDir = mkdtempSync(join(tmpdir(), 'vantage-mt-demo-'));
const DEMO_PORT = 42500 + Math.floor(Math.random() * 200);
const DEMO = `http://127.0.0.1:${DEMO_PORT}`;
let demoChild;

// -------------------------------------------------------- Production-mode server
const prodDir = mkdtempSync(join(tmpdir(), 'vantage-mt-prod-'));
const PROD_PORT = 42700 + Math.floor(Math.random() * 200);
const PROD = `http://127.0.0.1:${PROD_PORT}`;
let prodChild;

async function bootServer(port, workdir, env = {}, serverRoot = root) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      VANTAGE_DB: join(workdir, 'test.db'),
      VANTAGE_SCAN_MINUTES: '600',
      APP_VERSION: '2.0.0',
      VANTAGE_ENV: 'demo',
      VANTAGE_DEMO_MODE: '1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[srv:${port}] ${d}`));
  child.stdout.on('data', (d) => process.stderr.write(`[srv:${port}] ${d}`));

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server on ${port} did not become healthy`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
}

const api = (base, token) => (path, options = {}) => fetch(`${base}${path}`, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  },
});

before(async () => {
  // Boot demo server
  demoChild = await bootServer(DEMO_PORT, demoDir, { VANTAGE_PUBLIC_DEMO: '0' });
  // Boot production server
  prodChild = await bootServer(PROD_PORT, prodDir, {
    VANTAGE_ENV: 'production',
    VANTAGE_PUBLIC_DEMO: '0',
    VANTAGE_SESSION_SECRET: 'test-secret-at-least-32-characters-long',
  });
});

after(() => {
  if (demoChild) demoChild.kill('SIGTERM');
  if (prodChild) prodChild.kill('SIGTERM');
  rmSync(demoDir, { recursive: true, force: true });
  rmSync(prodDir, { recursive: true, force: true });
});

/* ===================== Production-mode tests ===================== */

test('PROD-1: production signup creates an isolated tenant with admin owner', async () => {
  const res = await fetch(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice Admin',
      email: 'alice@acme-corp.example',
      password: 'SecurePassword42!',
      company: 'Acme Corp',
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.email, 'alice@acme-corp.example');
  assert.equal(body.user.name, 'Alice Admin');

  // Verify the user can access their workspace
  const me = await api(PROD, body.token)('/api/me').then((r) => r.json());
  assert.equal(me.user.email, 'alice@acme-corp.example');
  assert.ok(me.company);
  assert.equal(me.company.name, 'Acme Corp');

  const dashboard = await api(PROD, body.token)('/api/dashboard').then((r) => r.json());
  assert.equal(dashboard.overall_readiness, 0,
    'an unevaluated tenant must not report readiness before it has control data');
  assert.ok(dashboard.frameworks.every((framework) => framework.readiness === 0));
  assert.ok(dashboard.frameworks.every((framework) => framework.controls_ok === 0),
    'the published count must not represent unevaluated controls as passing');
  const framework = await api(PROD, body.token)(`/api/frameworks/${dashboard.frameworks[0].slug}`).then((r) => r.json());
  assert.equal(framework.controls_ok, 0,
    'framework detail must publish the authoritative passing-control count');
});

test('PROD-1a: a partially evaluated control does not report readiness', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = join(prodDir, 'test.db');
  const testDb = new DatabaseSync(dbPath);
  const alice = testDb.prepare('SELECT tenant_id FROM users WHERE email = ?').get('alice@acme-corp.example');
  const test = testDb.prepare('SELECT id FROM tests WHERE tenant_id = ? LIMIT 1').get(alice.tenant_id);
  testDb.prepare("UPDATE tests SET status = 'ok' WHERE id = ?").run(test.id);
  testDb.close();

  const login = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme-corp.example', password: 'SecurePassword42!' }),
  }).then((r) => r.json());
  const dashboard = await api(PROD, login.token)('/api/dashboard').then((r) => r.json());
  assert.equal(dashboard.overall_readiness, 0,
    'a control with pending tests must not count as ready');
});

test('PROD-2: production signup creates a second isolated tenant', async () => {
  const res = await fetch(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Bob Boss',
      email: 'bob@widgets-inc.example',
      password: 'AnotherSecure42!',
      company: 'Widgets Inc',
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.name, 'Bob Boss');

  const me = await api(PROD, body.token)('/api/me').then((r) => r.json());
  assert.equal(me.company.name, 'Widgets Inc');
});

test('PROD-3: two tenants cannot see each other\'s data', async () => {
  // Sign in as Alice (Acme Corp)
  const aliceLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme-corp.example', password: 'SecurePassword42!' }),
  }).then((r) => r.json());
  const alice = api(PROD, aliceLogin.token);

  // Sign in as Bob (Widgets Inc)
  const bobLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@widgets-inc.example', password: 'AnotherSecure42!' }),
  }).then((r) => r.json());
  const bob = api(PROD, bobLogin.token);

  // Both should see frameworks (seeded on tenant creation)
  const aliceFrameworks = await alice('/api/frameworks').then((r) => r.json());
  const bobFrameworks = await bob('/api/frameworks').then((r) => r.json());
  assert.ok(aliceFrameworks.length > 0, 'Alice should have seeded frameworks');
  assert.ok(bobFrameworks.length > 0, 'Bob should have seeded frameworks');

  // Alice's users should not include Bob
  const aliceUsers = await alice('/api/users').then((r) => r.json());
  assert.ok(aliceUsers.some((u) => u.email === 'alice@acme-corp.example'));
  assert.ok(!aliceUsers.some((u) => u.email === 'bob@widgets-inc.example'), 'Alice must not see Bob');

  // Bob's users should not include Alice
  const bobUsers = await bob('/api/users').then((r) => r.json());
  assert.ok(bobUsers.some((u) => u.email === 'bob@widgets-inc.example'));
  assert.ok(!bobUsers.some((u) => u.email === 'alice@acme-corp.example'), 'Bob must not see Alice');

  // Alice and Bob should have isolated settings
  const aliceSettings = await alice('/api/settings').then((r) => r.json());
  const bobSettings = await bob('/api/settings').then((r) => r.json());
  assert.equal(aliceSettings.company?.name, 'Acme Corp');
  assert.equal(bobSettings.company?.name, 'Widgets Inc');

  // Activity feeds should be isolated
  const aliceActivity = await alice('/api/activity').then((r) => r.json());
  const bobActivity = await bob('/api/activity').then((r) => r.json());
  const aliceActorEmails = JSON.stringify(aliceActivity);
  const bobActorEmails = JSON.stringify(bobActivity);
  assert.ok(!aliceActorEmails.includes('bob@widgets-inc.example'), 'Alice\'s activity must not contain Bob');
  assert.ok(!bobActorEmails.includes('alice@acme-corp.example'), 'Bob\'s activity must not contain Alice');
});

test('PROD-3a: tenant service configuration remains isolated', async () => {
  const aliceLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme-corp.example', password: 'SecurePassword42!' }),
  }).then((r) => r.json());
  const bobLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@widgets-inc.example', password: 'AnotherSecure42!' }),
  }).then((r) => r.json());
  const alice = api(PROD, aliceLogin.token);
  const bob = api(PROD, bobLogin.token);

  const configured = await alice('/api/integrations/github/connect', {
    method: 'POST',
    body: JSON.stringify({ account: 'Acme Engineering' }),
  });
  assert.equal(configured.status, 200);

  const bobGitHub = (await bob('/api/integrations').then((r) => r.json())).find((i) => i.slug === 'github');
  assert.equal(bobGitHub.status, 'available');
  assert.equal(bobGitHub.account, null);

  assert.equal((await bob('/api/integrations/github/disconnect', { method: 'POST' })).status, 200);
  const aliceGitHub = (await alice('/api/integrations').then((r) => r.json())).find((i) => i.slug === 'github');
  assert.equal(aliceGitHub.status, 'configured');
  assert.equal(aliceGitHub.account, 'Acme Engineering');
});

test('PROD-4: tenant A cannot update tenant B\'s records', async () => {
  const aliceLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme-corp.example', password: 'SecurePassword42!' }),
  }).then((r) => r.json());
  const alice = api(PROD, aliceLogin.token);

  // Alice tries to access a framework slug that exists in her tenant
  const aliceFrameworks = await alice('/api/frameworks').then((r) => r.json());
  assert.ok(aliceFrameworks.length > 0);

  // Alice cannot toggle a framework by slug if it's not hers
  // (Since both tenants have same framework slugs due to seeding, this tests
  // that the lookup is scoped to the requesting user's tenant)
  const toggle = await alice('/api/frameworks/soc2/toggle', { method: 'POST' });
  assert.equal(toggle.status, 200); // Her own framework, should work

  // Verify the toggle only affected Alice's framework
  const aliceAfter = await alice('/api/frameworks').then((r) => r.json());
  const soc2 = aliceAfter.find((f) => f.slug === 'soc2');
  assert.equal(soc2.enabled, false, 'Alice\'s SOC2 should be toggled off');

  // Bob's SOC2 should still be enabled
  const bobLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@widgets-inc.example', password: 'AnotherSecure42!' }),
  }).then((r) => r.json());
  const bob = api(PROD, bobLogin.token);
  const bobFrameworks = await bob('/api/frameworks').then((r) => r.json());
  const bobSoc2 = bobFrameworks.find((f) => f.slug === 'soc2');
  assert.equal(bobSoc2.enabled, true, 'Bob\'s SOC2 must not be affected by Alice\'s toggle');
});

test('PROD-5: production mode cannot reset or reseed demo data', async () => {
  const aliceLogin = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme-corp.example', password: 'SecurePassword42!' }),
  }).then((r) => r.json());
  const alice = api(PROD, aliceLogin.token);

  const reset = await alice('/api/demo/reset', { method: 'POST' });
  assert.equal(reset.status, 403, 'production mode must refuse demo reset');
  const body = await reset.json();
  assert.match(body.error, /production/i);
});

test('PROD-6: production public config does not expose demo credentials', async () => {
  const config = await fetch(`${PROD}/api/public/config`).then((r) => r.json());
  assert.equal(config.production, true);
  assert.equal(config.demo.shared, false);
  assert.equal(config.demo.password, undefined);
  assert.equal(config.demo.accounts, undefined);
  assert.equal(config.guards.auto_reset, false);
  assert.equal(config.signup.requires_company, true);
});

test('PROD-7: duplicate email signup is rejected without tenant enumeration', async () => {
  const dup = await fetch(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice Again',
      email: 'alice@acme-corp.example',
      password: 'AnotherLong42!',
      company: 'Different Corp',
    }),
  });
  assert.equal(dup.status, 409);
  const body = await dup.json();
  // The error must not reveal which tenant the email belongs to
  assert.ok(!JSON.stringify(body).includes('Acme'), 'error must not reveal the existing tenant');
  assert.match(body.error, /already exists/);
});

test('PROD-8: production signup requires company name', async () => {
  const noCompany = await fetch(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'No Company',
      email: 'nocompany@example.com',
      password: 'LongEnough42!',
    }),
  });

  assert.equal(noCompany.status, 400);
  const body = await noCompany.json();
  assert.ok(body.errors.some((e) => /company/i.test(e)));
});

test('PROD-9: production mode CSRF is documented as bearer-token', async () => {
  const config = await fetch(`${PROD}/api/public/config`).then((r) => r.json());
  assert.equal(config.guards.csrf_protection, 'bearer_token');
});

test('PROD-10: production has no default public Trust Center', async () => {
  assert.equal((await fetch(`${PROD}/api/public/trust`)).status, 404);
  assert.equal((await fetch(`${PROD}/api/public/trust/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test', email: 'test@example.com', company: 'Test', document: 'Policy' }),
  })).status, 404);
});

test('PROD-11: production startup configuration fails closed before SQLite opens', () => {
  const missingMode = validateRuntimeConfig({});
  assert.equal(missingMode.ok, false);
  assert.match(missingMode.errors.join('\n'), /VANTAGE_ENV=production/);

  const unsafeDemo = validateRuntimeConfig({
    NODE_ENV: 'production',
    VANTAGE_ENV: 'production',
    VANTAGE_PUBLIC_DEMO: '1',
    VANTAGE_SESSION_SECRET: 'a'.repeat(32),
  });
  assert.equal(unsafeDemo.ok, false);
  assert.match(unsafeDemo.errors.join('\n'), /VANTAGE_PUBLIC_DEMO/);

  const shortSecret = validateRuntimeConfig({
    NODE_ENV: 'production',
    VANTAGE_ENV: 'production',
    VANTAGE_SESSION_SECRET: 'too-short',
  });
  assert.equal(shortSecret.ok, false);
  assert.match(shortSecret.errors.join('\n'), /at least 32/);

  const validFileSecret = validateRuntimeConfig({
    NODE_ENV: 'production',
    VANTAGE_ENV: 'production',
    VANTAGE_SESSION_SECRET: 'a'.repeat(32),
  });
  assert.equal(validFileSecret.ok, true);
});

test('MIGRATION: a real 1.3.0 database upgrades atomically and invalidates legacy sessions', async () => {
  const legacyRoot = mkdtempSync(join(tmpdir(), 'vantage-legacy-source-'));
  const migrationDir = mkdtempSync(join(tmpdir(), 'vantage-migration-'));
  const legacyPort = 42900 + Math.floor(Math.random() * 100);
  const migratedPort = 43000 + Math.floor(Math.random() * 100);
  let legacyChild;
  let migratedChild;
  try {
    mkdirSync(legacyRoot, { recursive: true });
    const archive = execFileSync('git', ['archive', LEGACY_COMMIT], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    execFileSync('tar', ['-x', '-C', legacyRoot], { input: archive });

    legacyChild = await bootServer(legacyPort, migrationDir, {
      VANTAGE_PUBLIC_DEMO: '1',
      VANTAGE_ALLOW_DEMO_RESET: '0',
    }, legacyRoot);
    const legacyLogin = await fetch(`http://127.0.0.1:${legacyPort}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@northwind.io', password: 'vantage123' }),
    });
    assert.equal(legacyLogin.status, 200);
    await legacyLogin.json();
    await stopServer(legacyChild);

    migratedChild = await bootServer(migratedPort, migrationDir, {
      VANTAGE_ENV: 'production',
      VANTAGE_PUBLIC_DEMO: '0',
      VANTAGE_ALLOW_DEMO_RESET: '0',
      VANTAGE_SESSION_SECRET: 'a'.repeat(32),
    });
    await stopServer(migratedChild);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const { DatabaseSync } = await import('node:sqlite');
    const migratedDb = new DatabaseSync(join(migrationDir, 'test.db'));
    assert.equal(migratedDb.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0,
      'all pre-migration bearer sessions must be invalidated');
    const legacyUser = migratedDb.prepare(
      `SELECT u.tenant_id, t.slug, t.name FROM users u
       JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?`,
    ).get('ada@northwind.io');
    assert.equal(legacyUser.tenant_id, 1, 'legacy users must remain in tenant 1');
    assert.equal(legacyUser.slug, 'default', 'legacy users must remain in the default tenant');
    assert.equal(legacyUser.name, 'Default Tenant', 'the default tenant must be quarantined');
    assert.equal(migratedDb.prepare('PRAGMA foreign_key_check').all().length, 0,
      'the migrated database must have no foreign-key violations');
    const customerTables = migratedDb.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('tenants', 'sqlite_sequence', 'readiness_probe')",
    ).all().map((row) => row.name);
    for (const table of customerTables) {
      const foreignKeys = migratedDb.prepare(`PRAGMA foreign_key_list(${table})`).all();
      assert.ok(foreignKeys.some((key) => key.from === 'tenant_id' && key.table === 'tenants'),
        `${table} must retain its tenant foreign key after migration`);
    }
    migratedDb.close();
  } finally {
    await stopServer(legacyChild);
    await stopServer(migratedChild);
    rmSync(legacyRoot, { recursive: true, force: true });
    rmSync(migrationDir, { recursive: true, force: true });
  }
});

/* ===================== Demo-mode multi-tenant ===================== */

test('DEMO-1: demo mode signup creates contributor in demo tenant', async () => {
  const login = await fetch(`${DEMO}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada@northwind.io', password: 'vantage123' }),
  }).then((r) => r.json());
  assert.ok(login.token);

  const signup = await fetch(`${DEMO}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Demo User',
      email: 'demo-user-mt@example.com',
      password: 'LongEnough42!',
    }),
  });
  assert.equal(signup.status, 201);
  const body = await signup.json();
  assert.equal(body.user.role, 'contributor');

  // Demo user and seeded user should share the same tenant
  const demoApi = api(DEMO, body.token);
  const users = await demoApi('/api/users').then((r) => r.json());
  assert.ok(users.some((u) => u.email === 'ada@northwind.io'), 'demo user should see seeded users');
});

/* ===================== Migration test ===================== */

test('MIGRATION: the schema includes tenant_id on all customer tables', async () => {
  // Use the production server's database to verify schema
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = join(prodDir, 'test.db');
  const testDb = new DatabaseSync(dbPath);

  const tables = testDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('readiness_probe', 'tenants', 'sqlite_sequence')"
  ).all().map((r) => r.name);

  for (const table of tables) {
    const cols = testDb.prepare(`PRAGMA table_info(${table})`).all();
    const hastenantId = cols.some((c) => c.name === 'tenant_id');
    assert.ok(hastenantId, `table ${table} is missing tenant_id column`);
  }

  // Verify tenants table exists and has at least one tenant
  const tenants = testDb.prepare('SELECT * FROM tenants').all();
  assert.ok(tenants.length >= 2, 'should have at least 2 tenants (from PROD signup tests)');

  testDb.close();
});
