import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('personal-project boundaries stay explicit', () => {
  const readme = read('README.md');
  const notice = read('PROJECT_NOTICE.md');
  const security = read('SECURITY.md');
  const publicSources = [
    readme,
    notice,
    security,
    read('package.json'),
    read('server/index.js'),
    read('server/public-mode.js'),
    read('web/src/App.jsx'),
    read('web/src/pages/Home.jsx'),
    read('web/src/pages/Login.jsx'),
    read('web/src/pages/TrustCenter.jsx'),
  ].join('\n');

  assert.match(notice, /personal project/i);
  assert.match(notice, /not endorsed by, sponsored by, affiliated with, or supported by\s+Microsoft/i);
  assert.match(readme, /current\s+repository uses a fictional, seeded SQLite dataset/i);
  assert.match(readme, /does not connect to Microsoft 365, Microsoft Purview, Azure/i);
  assert.match(security, /best-effort basis/i);

  for (const prohibited of [
    /buy me a coffee/i,
    /coffee\.insta\.host/i,
    /VANTAGE_DONATION_URL/i,
    /acknowledgement will be sent within/i,
    /only the latest released version receives fixes/i,
    /compliance that proves itself/i,
    /audit-ready evidence/i,
    /live data from your connected systems/i,
  ]) {
    assert.doesNotMatch(publicSources, prohibited);
  }
});
