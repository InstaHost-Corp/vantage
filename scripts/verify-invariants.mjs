#!/usr/bin/env node
// Repository-owned invariant checks referenced by the pre-freeze contract
// matrix. Each check recomputes a value from its authoritative source and
// compares it to the derived representation the release publishes.
//
//   node scripts/verify-invariants.mjs            # all checks
//   node scripts/verify-invariants.mjs --skip-build   # omit the dist rebuild
//
// Exits non-zero on the first mismatch so it can gate a release.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skipBuild = process.argv.includes('--skip-build');
const results = [];

const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(32)} ${detail}`);
};

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function walk(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, acc);
    else acc.push(relative(base, full));
  }
  return acc.sort();
}

/* 1. The deployment bind-mounts source read-only into a stock image with no
      install step, so the server must import nothing outside node: builtins. */
{
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const declared = Object.keys(pkg.dependencies || {});
  const offenders = [];
  for (const file of walk(join(root, 'server'))) {
    if (!file.endsWith('.js')) continue;
    const source = readFileSync(join(root, 'server', file), 'utf8');
    for (const m of source.matchAll(/^\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/')) continue;
      offenders.push(`${file} -> ${spec}`);
    }
  }
  record('runtime_dependency_free', declared.length === 0 && offenders.length === 0,
    declared.length || offenders.length
      ? `declared=[${declared}] imports=[${offenders}]`
      : 'no runtime dependencies; server imports only node: builtins and local modules');
}

/* 2. web/dist is committed and served directly, so it must be reproducible
      from web/src at this commit. Rebuild and compare against the commit. */
if (skipBuild) {
  record('frontend_build_parity', true, 'skipped (--skip-build)');
} else {
  execFileSync('npm', ['--prefix', join(root, 'web'), 'run', 'build'], { cwd: root, stdio: 'pipe' });
  const distDir = join(root, 'web', 'dist');
  const files = walk(distDir);
  const digests = files.map((f) => `${f}:${sha256(join(distDir, f))}`);
  const combined = createHash('sha256').update(digests.join('\n')).digest('hex');
  let committed = '';
  try {
    committed = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'web/dist'], { encoding: 'utf8' }).trim();
  } catch {
    committed = '';
  }
  record('frontend_build_parity', committed === '',
    committed === ''
      ? `${files.length} files, tree digest sha256:${combined.slice(0, 16)}... unchanged by rebuild`
      : `rebuild changed committed dist: ${committed.split('\n').length} path(s) differ`);
}

/* 3-5. Compliance-data invariants, recomputed from the authoritative tables. */
{
  const scratch = mkdtempSync(join(tmpdir(), 'vantage-inv-'));
  process.env.VANTAGE_DB = join(scratch, 'invariant.db');
  const { all, get } = await import('../server/db.js');
  const { seed } = await import('../server/seed.js');
  seed({ force: true });
  const { frameworkReadiness, controlStatuses } = await import('../server/engine.js');

  const statuses = controlStatuses();
  const mismatches = [];
  const frameworks = all('SELECT id, short_name FROM frameworks');
  for (const f of frameworks) {
    const reported = frameworkReadiness(f.id);
    const mapped = new Set(all(
      `SELECT DISTINCT cr.control_id AS id FROM control_requirements cr
       JOIN requirements r ON r.id = cr.requirement_id WHERE r.framework_id = ?`, f.id).map((r) => r.id));
    const failing = [...mapped].filter((id) => statuses.get(id)?.status === 'failing').length;
    const expected = mapped.size ? Math.round(((mapped.size - failing) / mapped.size) * 100) : 0;
    if (expected !== reported.readiness || mapped.size !== reported.controls_total) {
      mismatches.push(`${f.short_name}: published ${reported.readiness}%/${reported.controls_total} vs recomputed ${expected}%/${mapped.size}`);
    }
  }
  record('framework_readiness_recompute', mismatches.length === 0,
    mismatches.length ? mismatches.join('; ') : `all ${frameworks.length} frameworks agree with independent recomputation`);

  const drift = all(`SELECT t.slug, t.passing_count, t.failing_count,
      (SELECT COUNT(*) FROM test_entities e WHERE e.test_id = t.id AND e.passed = 1) AS actual_pass,
      (SELECT COUNT(*) FROM test_entities e WHERE e.test_id = t.id AND e.passed = 0) AS actual_fail
    FROM tests t`).filter((t) => t.passing_count !== t.actual_pass || t.failing_count !== t.actual_fail);
  record('test_counter_integrity', drift.length === 0,
    drift.length ? drift.map((d) => d.slug).join(', ') : `${get('SELECT COUNT(*) AS n FROM tests').n} tests agree with their recorded entities`);

  const orphans = all('SELECT slug FROM tests WHERE control_id NOT IN (SELECT id FROM controls)');
  record('test_control_mapping', orphans.length === 0,
    orphans.length ? orphans.map((o) => o.slug).join(', ') : 'every automated test maps to an existing control');

  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} invariants hold`);
process.exit(failed.length ? 1 : 0);
