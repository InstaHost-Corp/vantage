import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compilePath, createApp, jsonBody, mimeFor, staticFiles } from '../server/http.js';

const listen = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
};

test('compilePath extracts named parameters and anchors the match', () => {
  const { regex, keys } = compilePath('/api/tests/:slug/run');
  assert.deepEqual(keys, ['slug']);
  assert.ok(regex.test('/api/tests/aws-iam-mfa/run'));
  assert.ok(!regex.test('/api/tests/aws-iam-mfa/run/extra'));
  assert.ok(!regex.test('/prefix/api/tests/x/run'));
  assert.equal(regex.exec('/api/tests/aws-iam-mfa/run')[1], 'aws-iam-mfa');
});

test('compilePath passes a RegExp through unchanged', () => {
  const { regex } = compilePath(/^\/(?!api).*/);
  assert.ok(regex.test('/frameworks/soc2'));
  assert.ok(!regex.test('/api/dashboard'));
});

test('routes match on method and expose params, query and json body', async () => {
  const app = createApp();
  app.use(jsonBody());
  app.get('/api/items/:id', (req, res) => res.json({ id: req.params.id, q: req.query.expand }));
  app.post('/api/items/:id', (req, res) => res.status(201).json({ id: req.params.id, got: req.body }));
  const { base, close } = await listen(app);

  const got = await fetch(`${base}/api/items/42?expand=true`).then((r) => r.json());
  assert.deepEqual(got, { id: '42', q: 'true' });

  const posted = await fetch(`${base}/api/items/7`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 1 }),
  });
  assert.equal(posted.status, 201);
  assert.deepEqual(await posted.json(), { id: '7', got: { a: 1 } });

  // A GET route must not answer a DELETE.
  assert.equal((await fetch(`${base}/api/items/7`, { method: 'DELETE' })).status, 404);
  await close();
});

test('malformed json is rejected with 400 rather than crashing the process', async () => {
  const app = createApp();
  app.use(jsonBody());
  app.post('/api/echo', (req, res) => res.json(req.body));
  const { base, close } = await listen(app);
  const res = await fetch(`${base}/api/echo`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
  });
  assert.equal(res.status, 400);
  await close();
});

test('a body larger than the limit is refused with 413', async () => {
  const app = createApp();
  app.use(jsonBody({ limit: 64 }));
  app.post('/api/echo', (req, res) => res.json(req.body ?? {}));
  const { base, close } = await listen(app);
  let status;
  try {
    status = (await fetch(`${base}/api/echo`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(500) }),
    })).status;
  } catch {
    status = 413; // connection torn down after the limit response
  }
  assert.equal(status, 413);
  await close();
});

test('mounted middleware sees the path relative to its mount and restores it', async () => {
  const app = createApp();
  const seen = [];
  app.use('/api', (req, res, next) => { seen.push(req.path); next(); });
  app.get('/api/deep/route', (req, res) => res.json({ outer: req.path }));
  const { base, close } = await listen(app);
  const body = await fetch(`${base}/api/deep/route`).then((r) => r.json());
  assert.deepEqual(seen, ['/deep/route']);
  assert.equal(body.outer, '/api/deep/route');
  await close();
});

test('mounted middleware does not capture a sibling prefix', async () => {
  const app = createApp();
  let hit = false;
  app.use('/api', (req, res, next) => { hit = true; next(); });
  app.get('/apidocs', (req, res) => res.json({ ok: true }));
  const { base, close } = await listen(app);
  await fetch(`${base}/apidocs`);
  assert.equal(hit, false);
  await close();
});

test('static files are served and directory traversal is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vantage-static-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<h1>ok</h1>');
  writeFileSync(join(root, 'assets', 'index-ABCDEFGH12.css'), 'body{}');
  writeFileSync(join(tmpdir(), 'vantage-secret.txt'), 'do-not-serve');

  const app = createApp();
  app.use(staticFiles(root));
  const { base, close } = await listen(app);

  const index = await fetch(`${base}/index.html`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);

  const asset = await fetch(`${base}/assets/index-ABCDEFGH12.css`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);

  const escaped = await fetch(`${base}/../vantage-secret.txt`);
  assert.notEqual(await escaped.text(), 'do-not-serve');
  await close();
});

test('an unmatched /api path returns a json 404 and a page path returns text', async () => {
  const app = createApp();
  const { base, close } = await listen(app);
  const api = await fetch(`${base}/api/nope`);
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: 'Not found' });
  const page = await fetch(`${base}/nope`);
  assert.equal(page.status, 404);
  await close();
});

test('a throwing handler returns 500 without killing the server', async () => {
  const app = createApp();
  app.get('/api/boom', () => { throw new Error('kaboom'); });
  app.get('/api/fine', (req, res) => res.json({ ok: true }));
  const { base, close } = await listen(app);
  const boom = await fetch(`${base}/api/boom`);
  assert.equal(boom.status, 500);
  const fine = await fetch(`${base}/api/fine`).then((r) => r.json());
  assert.deepEqual(fine, { ok: true });
  await close();
});

test('mimeFor maps the asset types the frontend build emits', () => {
  assert.match(mimeFor('app.js'), /javascript/);
  assert.match(mimeFor('app.css'), /text\/css/);
  assert.match(mimeFor('icon.svg'), /image\/svg/);
  assert.equal(mimeFor('unknown.bin'), 'application/octet-stream');
});
