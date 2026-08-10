// Minimal zero-dependency HTTP layer with an Express-compatible surface.
//
// The estate deployment pattern bind-mounts the release source read-only into a
// stock node image, so there is no place to run `npm install` at deploy time.
// This module provides exactly the routing, body-parsing and static-file
// features server/index.js uses, with no third-party packages.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export const mimeFor = (file) => MIME[extname(file).toLowerCase()] || 'application/octet-stream';

// Compiles '/api/tests/:slug/run' into a matcher, or passes a RegExp through.
export function compilePath(path) {
  if (path instanceof RegExp) return { regex: path, keys: [] };
  const keys = [];
  let pattern = '';
  for (const segment of String(path).split('/')) {
    if (!segment) continue;
    if (segment.startsWith(':')) {
      keys.push(segment.slice(1));
      pattern += '/([^/]+)';
    } else {
      pattern += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    }
  }
  return { regex: new RegExp(`^${pattern || '/'}/?$`), keys };
}

function decorateRequest(req) {
  const url = new URL(req.url, 'http://localhost');
  req.pathname = decodeURIComponent(url.pathname);
  req.path = req.pathname;
  req.query = Object.fromEntries(url.searchParams.entries());
  req.params = {};
  req.body = undefined;
  req.get = (name) => req.headers[String(name).toLowerCase()];
  return req;
}

function decorateResponse(res) {
  res.statusCode = 200;
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (name, value) => { res.setHeader(name, value); return res; };
  res.type = (value) => res.set('content-type', value);
  res.json = (payload) => {
    const body = JSON.stringify(payload);
    if (!res.hasHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-length', Buffer.byteLength(body));
    res.end(res.req?.method === 'HEAD' ? undefined : body);
    return res;
  };
  res.send = (payload) => {
    if (payload === undefined || payload === null) return res.end();
    if (Buffer.isBuffer(payload)) {
      res.setHeader('content-length', payload.length);
      return res.end(res.req?.method === 'HEAD' ? undefined : payload);
    }
    if (typeof payload === 'object') return res.json(payload);
    if (!res.hasHeader('content-type')) res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-length', Buffer.byteLength(String(payload)));
    return res.end(res.req?.method === 'HEAD' ? undefined : String(payload));
  };
  res.redirect = (location, code = 302) => {
    res.statusCode = code;
    res.setHeader('location', location);
    res.end();
    return res;
  };
  res.sendFile = (file) => sendFile(res.req, res, file);
  return res;
}

function sendFile(req, res, file, { cacheControl } = {}) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.statusCode = 404;
    return res.end('Not found');
  }
  if (!stat.isFile()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('content-type', mimeFor(file));
  res.setHeader('content-length', stat.size);
  res.setHeader('last-modified', stat.mtime.toUTCString());
  if (cacheControl) res.setHeader('cache-control', cacheControl);
  if (req.method === 'HEAD') return res.end();
  return createReadStream(file).pipe(res);
}

// express.json() equivalent.
export function jsonBody({ limit = 1_000_000 } = {}) {
  return (req, res, next) => {
    const type = String(req.headers['content-type'] || '');
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !type.includes('application/json')) {
      return next();
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) { req.body = {}; return next(); }
      try {
        req.body = JSON.parse(raw);
      } catch {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
      next();
    });
    req.on('error', () => next());
  };
}

// express.static() equivalent: serves files under root, never above it.
export function staticFiles(root, { cacheControl = 'public, max-age=300' } = {}) {
  const base = resolve(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const relative = normalize(req.path).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const target = resolve(join(base, relative));
    if (target !== base && !target.startsWith(base + sep)) return next();
    let candidate = target;
    try {
      if (statSync(candidate).isDirectory()) candidate = join(candidate, 'index.html');
    } catch {
      return next();
    }
    if (!existsSync(candidate)) return next();
    // Vite emits content-hashed asset filenames, so they are immutable.
    const immutable = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(candidate);
    return sendFile(req, res, candidate, {
      cacheControl: immutable ? 'public, max-age=31536000, immutable' : cacheControl,
    });
  };
}

export function createApp() {
  const layers = [];

  // Routes accept a chain of handlers, so `app.get(path, requireAuth, handler)`
  // behaves the way it does in Express: each handler either responds or calls
  // next() to pass control along the chain.
  const add = (method, path, handlers) => {
    const { regex, keys } = compilePath(path);
    layers.push({ kind: 'route', method, regex, keys, handlers: handlers.filter((h) => typeof h === 'function') });
  };

  const runChain = (handlers, req, res, done) => {
    let i = 0;
    const step = (err) => {
      if (err) return done(err);
      if (res.writableEnded) return undefined;
      const handler = handlers[i++];
      if (!handler) return done();
      return handler(req, res, step);
    };
    return step();
  };

  const app = {
    get: (path, ...handlers) => add('GET', path, handlers),
    post: (path, ...handlers) => add('POST', path, handlers),
    patch: (path, ...handlers) => add('PATCH', path, handlers),
    put: (path, ...handlers) => add('PUT', path, handlers),
    delete: (path, ...handlers) => add('DELETE', path, handlers),
    use(mountOrHandler, ...rest) {
      const mount = typeof mountOrHandler === 'string' ? mountOrHandler : null;
      const handlers = (typeof mountOrHandler === 'string' ? rest : [mountOrHandler, ...rest])
        .filter((h) => typeof h === 'function');
      layers.push({ kind: 'middleware', mount, handlers });
      return app;
    },
    handler(req, res) {
      res.req = req;
      decorateRequest(req);
      decorateResponse(res);

      let index = 0;
      const next = (err) => {
        if (err) return fail(err);
        if (res.writableEnded) return undefined;
        const layer = layers[index++];
        if (!layer) {
          if (req.path.startsWith('/api')) {
            res.statusCode = 404;
            return res.json({ error: 'Not found' });
          }
          res.statusCode = 404;
          return res.send('Not found');
        }
        try {
          if (layer.kind === 'middleware') {
            if (layer.mount && !(req.pathname === layer.mount || req.pathname.startsWith(`${layer.mount}/`))) {
              return next();
            }
            const original = req.path;
            if (layer.mount) req.path = req.pathname.slice(layer.mount.length) || '/';
            return runChain(layer.handlers, req, res, (err2) => { req.path = original; next(err2); });
          }
          const method = req.method === 'HEAD' ? 'GET' : req.method;
          if (layer.method !== method) return next();
          const match = layer.regex.exec(req.pathname);
          if (!match) return next();
          req.params = {};
          layer.keys.forEach((key, i) => { req.params[key] = decodeURIComponent(match[i + 1]); });
          return runChain(layer.handlers, req, res, next);
        } catch (err2) {
          return fail(err2);
        }
      };

      const fail = (err) => {
        console.error(`[vantage] ${req.method} ${req.pathname} failed:`, err?.stack || err);
        if (res.writableEnded || res.headersSent) return res.end();
        res.statusCode = 500;
        return res.json({ error: 'Internal server error' });
      };

      next();
    },
    listen(port, hostOrCb, maybeCb) {
      const host = typeof hostOrCb === 'string' ? hostOrCb : '0.0.0.0';
      const cb = typeof hostOrCb === 'function' ? hostOrCb : maybeCb;
      const server = createServer((req, res) => app.handler(req, res));
      server.listen(port, host, cb);
      return server;
    },
  };

  return app;
}

export default createApp;
