// The demonstration promises on its own sign-in page that it resets daily.
// A schedule anchored to process start would break that promise silently: every
// restart before the deadline postpones the reset by another full interval, and
// the service keeps saying "daily" while a visitor's changes sit there for days.
//
// This boots the real server against a throwaway database, changes something as
// a visitor would, restarts, and proves the cadence survived.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workdir = mkdtempSync(join(tmpdir(), 'vantage-restart-'));
const DB = join(workdir, 'restart.db');
const PORT = 42100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;

let current = null;

async function boot() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT), HOST: '127.0.0.1', VANTAGE_DB: DB,
      VANTAGE_ENV: 'demo', VANTAGE_DEMO_MODE: '1',
      VANTAGE_PUBLIC_DEMO: '1', VANTAGE_SCAN_MINUTES: '600', APP_VERSION: '1.2.0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });

  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('server did not become healthy');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  current = child;
  return { child, log: () => log };
}

async function stop(child) {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (current === child) current = null;
}

const markerOf = () => {
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT value FROM settings WHERE key = 'demo_reset'").get();
  db.close();
  return row ? JSON.parse(row.value) : null;
};

const setMarker = (value) => {
  const db = new DatabaseSync(DB);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'demo_reset'").run(JSON.stringify(value));
  db.close();
};

const signIn = async () => (await (await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ada@northwind.io', password: 'vantage123' }),
})).json()).token;

const statusOf = async (token) => (await (await fetch(`${BASE}/api/tests/device-encryption`, {
  headers: { authorization: `Bearer ${token}` },
})).json()).status;

after(() => {
  if (current) current.kill('SIGTERM');
  rmSync(workdir, { recursive: true, force: true });
});

test('the daily reset survives a restart and catches up when it is overdue', async () => {
  let server = await boot();

  const first = await (await fetch(`${BASE}/api/public/config`)).json();
  assert.equal(first.demo.reset_interval_minutes, 1440);
  assert.ok(first.demo.next_reset_at, 'the schedule must publish its next reset');

  // A visitor changes something.
  let token = await signIn();
  assert.equal(await statusOf(token), 'failing', 'the seeded baseline has this test failing');
  await fetch(`${BASE}/api/tests/device-encryption/remediate`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}',
  });
  assert.equal(await statusOf(token), 'ok', 'the visitor change took effect');

  // Restart well inside the window: the change must survive, because the
  // demonstration is shared and only resets on its cadence.
  await stop(server.child);
  server = await boot();
  token = await signIn();
  assert.equal(await statusOf(token), 'ok', 'a restart inside the window must not reset the tenant');

  // Now the service was down across the deadline. Backdate the persisted marker
  // and restart: the reset is overdue and must happen at boot.
  await stop(server.child);
  const db = new DatabaseSync(DB);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'demo_reset'")
    .run(JSON.stringify({ at: new Date(Date.now() - 3 * 86400000).toISOString() }));
  db.close();

  server = await boot();
  token = await signIn();
  assert.equal(await statusOf(token), 'failing', 'an overdue reset must happen at boot, not a day later');
  assert.match(server.log(), /overdue at boot/, 'the service should say it caught up');

  const after_ = await (await fetch(`${BASE}/api/public/config`)).json();
  assert.ok(new Date(after_.demo.next_reset_at).getTime() > Date.now(),
    'the next reset must be rescheduled from the reset that just happened');
  await stop(server.child);
});

test('a corrupt or future-dated reset marker is repaired rather than trusted', async () => {
  let server = await boot();
  await stop(server.child);

  // A truthy but unparseable marker is the dangerous case: it is not "missing",
  // so a naive check leaves it in place, and every restart then re-anchors the
  // daily clock — silently recreating the fault the marker exists to prevent.
  setMarker({ at: 'not-a-date' });
  server = await boot();
  const repaired = markerOf();
  assert.ok(Number.isFinite(new Date(repaired.at).getTime()),
    `a corrupt marker must be repaired, found ${JSON.stringify(repaired)}`);
  assert.ok(Math.abs(new Date(repaired.at).getTime() - Date.now()) < 5 * 60_000,
    'the repaired marker should be anchored to now');
  await stop(server.child);

  // A far-future marker would postpone the reset indefinitely.
  const future = new Date(Date.now() + 400 * 86400000).toISOString();
  setMarker({ at: future });
  server = await boot();
  const corrected = markerOf();
  assert.notEqual(corrected.at, future, 'a future-dated marker must not be trusted');
  assert.ok(new Date(corrected.at).getTime() <= Date.now() + 5 * 60_000,
    'the corrected marker must not be in the future');

  const config = await (await fetch(`${BASE}/api/public/config`)).json();
  const nextReset = new Date(config.demo.next_reset_at).getTime();
  assert.ok(nextReset - Date.now() <= 1441 * 60_000,
    'the next reset must be within a day, not four hundred days out');
  await stop(server.child);
});
