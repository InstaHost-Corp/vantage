import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');

// In production the application source is bind-mounted read-only, so only
// create the bundled data directory when it is actually the database location.
export const DB_PATH = process.env.VANTAGE_DB || join(DATA_DIR, 'vantage.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  title TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS frameworks (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  target_date TEXT,
  audit_status TEXT NOT NULL DEFAULT 'not_started'
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY,
  framework_id INTEGER NOT NULL REFERENCES frameworks(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  section TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS controls (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS control_requirements (
  control_id INTEGER NOT NULL REFERENCES controls(id),
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  PRIMARY KEY (control_id, requirement_id)
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  control_id INTEGER NOT NULL REFERENCES controls(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  remediation TEXT NOT NULL,
  severity TEXT NOT NULL,
  integration TEXT NOT NULL,
  rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  failing_count INTEGER NOT NULL DEFAULT 0,
  passing_count INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  last_run TEXT,
  disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_entities (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  passed INTEGER NOT NULL,
  message TEXT NOT NULL,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  integration TEXT NOT NULL,
  type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  owner TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  account TEXT,
  connected_at TEXT,
  last_sync TEXT
);

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  approved_at TEXT,
  renewal_date TEXT
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
  policy_id INTEGER NOT NULL REFERENCES policies(id),
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (policy_id, personnel_id)
);

CREATE TABLE IF NOT EXISTS personnel (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  status TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  background_check TEXT NOT NULL DEFAULT 'not_started',
  security_training TEXT NOT NULL DEFAULT 'not_started',
  training_due TEXT,
  offboarded_access_removed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  name TEXT NOT NULL,
  os TEXT NOT NULL,
  os_version TEXT NOT NULL,
  serial TEXT NOT NULL,
  mdm TEXT NOT NULL,
  encrypted INTEGER NOT NULL,
  screen_lock INTEGER NOT NULL,
  antivirus INTEGER NOT NULL,
  os_up_to_date INTEGER NOT NULL,
  last_checkin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  data_processed TEXT NOT NULL,
  subprocessor INTEGER NOT NULL DEFAULT 0,
  owner_id INTEGER REFERENCES users(id),
  security_review_status TEXT NOT NULL,
  soc2 INTEGER NOT NULL DEFAULT 0,
  iso27001 INTEGER NOT NULL DEFAULT 0,
  last_reviewed TEXT,
  next_review TEXT,
  annual_cost INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS risks (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  likelihood INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  treatment TEXT NOT NULL,
  residual_likelihood INTEGER NOT NULL,
  residual_impact INTEGER NOT NULL,
  status TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  due_date TEXT,
  mitigation TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY,
  framework_id INTEGER NOT NULL REFERENCES frameworks(id),
  name TEXT NOT NULL,
  auditor_firm TEXT NOT NULL,
  auditor_name TEXT NOT NULL,
  auditor_email TEXT NOT NULL,
  type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL,
  report_url TEXT
);

CREATE TABLE IF NOT EXISTS audit_requests (
  id INTEGER PRIMARY KEY,
  audit_id INTEGER NOT NULL REFERENCES audits(id),
  ref TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY,
  control_id INTEGER REFERENCES controls(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  renewal_date TEXT
);

CREATE TABLE IF NOT EXISTS trust_documents (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  gated INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_requests (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  document TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questionnaires (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questionnaire_items (
  id INTEGER PRIMARY KEY,
  questionnaire_id INTEGER NOT NULL REFERENCES questionnaires(id),
  question TEXT NOT NULL,
  answer TEXT,
  confidence INTEGER,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'unanswered'
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_entities_test ON test_entities(test_id);
CREATE INDEX IF NOT EXISTS idx_tests_control ON tests(control_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
CREATE INDEX IF NOT EXISTS idx_requirements_fw ON requirements(framework_id);
`);

export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const get = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function setting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export function logActivity(type, actor, message) {
  run('INSERT INTO activity (type, actor, message, created_at) VALUES (?, ?, ?, ?)', type, actor, message, new Date().toISOString());
}
