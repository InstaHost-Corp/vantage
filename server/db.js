import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeServiceReference } from './service-reference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');

// In production the application source is bind-mounted read-only, so only
// create the bundled data directory when it is actually the database location.
export const DB_PATH = process.env.VANTAGE_DB || join(DATA_DIR, 'vantage.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// Multi-tenant migration: upgrades a pre-2.0 single-tenant database.
// ---------------------------------------------------------------------------

const needsMigration = !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'").get()
  && !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

if (needsMigration) {
  console.log('[vantage] migrating database to multi-tenant schema (v2.0.0)...');
  // Recreating referenced parent tables temporarily invalidates foreign-key
  // links. Validate the completed graph explicitly before committing instead
  // of allowing an intermediate table order to reject a valid upgrade.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE tenants (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    db.prepare("INSERT INTO tenants (id, slug, name, created_at) VALUES (1, 'default', 'Default Tenant', ?)")
      .run(new Date().toISOString());

    // Helper: recreate a table with tenant_id and updated constraints.
    const recreate = (name, ddl, cols) => {
      db.exec(`CREATE TABLE ${name}__mt (${ddl})`);
      db.exec(`INSERT INTO ${name}__mt (${cols.join(', ')}, tenant_id) SELECT ${cols.join(', ')}, 1 FROM ${name}`);
      db.exec(`DROP TABLE ${name}`);
      db.exec(`ALTER TABLE ${name}__mt RENAME TO ${name}`);
    };

    recreate('users', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      title TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, email)
    `, ['id', 'email', 'name', 'password_hash', 'role', 'title', 'created_at']);

    recreate('frameworks', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      target_date TEXT,
      audit_status TEXT NOT NULL DEFAULT 'not_started',
      UNIQUE(tenant_id, slug)
    `, ['id', 'slug', 'name', 'short_name', 'category', 'description', 'color', 'enabled', 'target_date', 'audit_status']);

    recreate('controls', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      owner_id INTEGER REFERENCES users(id),
      UNIQUE(tenant_id, code)
    `, ['id', 'code', 'name', 'description', 'category', 'owner_id']);

    recreate('tests', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      slug TEXT NOT NULL,
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
      disabled INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tenant_id, slug)
    `, ['id', 'slug', 'control_id', 'name', 'description', 'remediation', 'severity', 'integration', 'rule', 'status', 'failing_count', 'passing_count', 'deadline', 'last_run', 'disabled']);

    recreate('integrations', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      account TEXT,
      connected_at TEXT,
      last_sync TEXT,
      UNIQUE(tenant_id, slug)
    `, ['id', 'slug', 'name', 'category', 'description', 'status', 'account', 'connected_at', 'last_sync']);

    recreate('policies', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      body TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      owner_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      renewal_date TEXT,
      UNIQUE(tenant_id, slug)
    `, ['id', 'slug', 'name', 'category', 'description', 'body', 'version', 'status', 'owner_id', 'approved_at', 'renewal_date']);

    recreate('personnel', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      status TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      background_check TEXT NOT NULL DEFAULT 'not_started',
      security_training TEXT NOT NULL DEFAULT 'not_started',
      training_due TEXT,
      offboarded_access_removed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tenant_id, email)
    `, ['id', 'name', 'email', 'title', 'department', 'employment_type', 'status', 'start_date', 'end_date', 'background_check', 'security_training', 'training_due', 'offboarded_access_removed']);

    recreate('risks', `
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      code TEXT NOT NULL,
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
      mitigation TEXT NOT NULL DEFAULT '',
      UNIQUE(tenant_id, code)
    `, ['id', 'code', 'title', 'description', 'category', 'likelihood', 'impact', 'treatment', 'residual_likelihood', 'residual_impact', 'status', 'owner_id', 'due_date', 'mitigation']);

    recreate('settings', `
      tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (tenant_id, key)
    `, ['key', 'value']);

    // Tables that only need the column added (no PK/UNIQUE changes).
    const simpleAlter = [
      'sessions', 'requirements', 'control_requirements', 'test_entities',
      'resources', 'policy_acceptances', 'devices', 'vendors', 'audits',
      'audit_requests', 'evidence', 'trust_documents', 'trust_requests',
      'questionnaires', 'questionnaire_items', 'activity',
    ];
    for (const t of simpleAlter) {
      db.exec(`ALTER TABLE ${t} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id)`);
    }

    // Existing bearer tokens grant access to the legacy shared workspace but
    // production login deliberately quarantines it. Invalidate them together
    // with the schema transition so authentication is never split-brain.
    db.exec('DELETE FROM sessions');

    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) {
      throw new Error(`multi-tenant migration foreign-key check failed: ${JSON.stringify(violations[0])}`);
    }
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
    console.log('[vantage] multi-tenant migration complete');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already gone */ }
    db.exec('PRAGMA foreign_keys = ON');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schema (CREATE TABLE IF NOT EXISTS for fresh databases)
// ---------------------------------------------------------------------------

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  title TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS frameworks (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  target_date TEXT,
  audit_status TEXT NOT NULL DEFAULT 'not_started',
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  framework_id INTEGER NOT NULL REFERENCES frameworks(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  section TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS controls (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS control_requirements (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  control_id INTEGER NOT NULL REFERENCES controls(id),
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  PRIMARY KEY (control_id, requirement_id)
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
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
  disabled INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS test_entities (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  account TEXT,
  connected_at TEXT,
  last_sync TEXT,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  approved_at TEXT,
  renewal_date TEXT,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  policy_id INTEGER NOT NULL REFERENCES policies(id),
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (policy_id, personnel_id)
);

CREATE TABLE IF NOT EXISTS personnel (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  status TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  background_check TEXT NOT NULL DEFAULT 'not_started',
  security_training TEXT NOT NULL DEFAULT 'not_started',
  training_due TEXT,
  offboarded_access_removed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
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
  mitigation TEXT NOT NULL DEFAULT '',
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  control_id INTEGER REFERENCES controls(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  renewal_date TEXT
);

CREATE TABLE IF NOT EXISTS trust_documents (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  gated INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_requests (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  document TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questionnaires (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questionnaire_items (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  questionnaire_id INTEGER NOT NULL REFERENCES questionnaires(id),
  question TEXT NOT NULL,
  answer TEXT,
  confidence INTEGER,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'unanswered'
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_test_entities_test ON test_entities(test_id);
CREATE INDEX IF NOT EXISTS idx_tests_control ON tests(control_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
CREATE INDEX IF NOT EXISTS idx_requirements_fw ON requirements(framework_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_frameworks_tenant ON frameworks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_controls_tenant ON controls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tests_tenant ON tests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity(tenant_id);
`);

// Prior releases presented the seeded catalogue as connected although no
// provider authorization or collection capability exists. Preserve the
// tenant-owned reference while making the capability state truthful.
db.exec("UPDATE integrations SET status = 'configured', last_sync = NULL WHERE status = 'connected'");
for (const integration of db.prepare('SELECT id, account FROM integrations WHERE account IS NOT NULL').all()) {
  if (!normalizeServiceReference(integration.account)) {
    db.prepare("UPDATE integrations SET account = NULL, status = 'available', connected_at = NULL, last_sync = NULL WHERE id = ?")
      .run(integration.id);
  }
}
db.exec(`UPDATE activity SET message = 'Configured a workspace service reference'
  WHERE type IN ('integration', 'integration_sync') AND (
    message LIKE 'Configured % for %'
    OR message LIKE 'Synced % resources from %'
    OR message LIKE 'Connected %'
  )`);

export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const get = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function setting(key, fallback = null, tenantId = 1) {
  const row = get('SELECT value FROM settings WHERE tenant_id = ? AND key = ?', tenantId, key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value, tenantId = 1) {
  run(
    'INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value',
    tenantId, key, JSON.stringify(value),
  );
}

export function logActivity(type, actor, message, tenantId = 1) {
  run(
    'INSERT INTO activity (tenant_id, type, actor, message, created_at) VALUES (?, ?, ?, ?, ?)',
    tenantId, type, actor, message, new Date().toISOString(),
  );
}
