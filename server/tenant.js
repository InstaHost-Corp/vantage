// Multi-tenant isolation, tenant lifecycle and production-mode guards.
//
// Every customer-owned table carries a tenant_id. This module centralises
// the creation and framework-seeding of new tenants, and the production-mode
// configuration that makes Vantage fail closed when VANTAGE_ENV=production.

import { randomUUID } from 'node:crypto';
import { db, all, get, run } from './db.js';
import { frameworks, requirements, controls, tests, integrationCatalog } from './seed-frameworks.js';

// ---------------------------------------------------------------------------
// Production mode
// ---------------------------------------------------------------------------

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const boolEnv = (v, fallback = false) =>
  (v === undefined || v === '' ? fallback : TRUTHY.has(String(v).toLowerCase()));

export function isProduction(env = process.env) {
  return env.VANTAGE_ENV === 'production';
}

/** Validates that the environment is safe to start in production mode. */
export function validateProductionConfig(env = process.env) {
  const errors = [];
  if (boolEnv(env.VANTAGE_PUBLIC_DEMO)) {
    errors.push('VANTAGE_PUBLIC_DEMO must not be enabled in production');
  }
  if (boolEnv(env.VANTAGE_ALLOW_DEMO_RESET)) {
    errors.push('VANTAGE_ALLOW_DEMO_RESET must not be enabled in production');
  }
  if (!env.VANTAGE_SESSION_SECRET) {
    errors.push('VANTAGE_SESSION_SECRET must be set in production (random >=32-char string)');
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Tenant lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a new tenant with the given company name, seeds the compliance
 * framework library for it, and returns the tenant row.
 */
export function createTenant(companyName) {
  const base = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const slug = base || randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  // Slug collision: append a short random suffix.
  const existing = get('SELECT id FROM tenants WHERE slug = ?', slug);
  const finalSlug = existing ? `${slug}-${randomUUID().slice(0, 6)}` : slug;

  run(
    'INSERT INTO tenants (slug, name, created_at) VALUES (?, ?, ?)',
    finalSlug,
    companyName,
    now,
  );
  const tenant = get('SELECT * FROM tenants WHERE slug = ?', finalSlug);
  seedTenantFrameworks(tenant.id);
  return tenant;
}

/**
 * Seeds the compliance framework library (frameworks, requirements, controls,
 * control→requirement mappings, automated tests and the integration catalogue)
 * for a newly created tenant. This gives the tenant a working Vantage
 * workspace from their first sign-in.
 *
 * Customer data (personnel, devices, resources, vendors, risks, policies,
 * audits, evidence, etc.) is NOT seeded — the tenant populates those.
 */
export function seedTenantFrameworks(tenantId) {
  // Frameworks
  for (const f of frameworks) {
    run(
      `INSERT INTO frameworks (tenant_id, slug, name, short_name, category, description, color, enabled, target_date, audit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      tenantId, f.slug, f.name, f.short_name, f.category, f.description, f.color, f.target_date, f.audit_status,
    );
  }

  // Controls (no owner assigned)
  for (const c of controls) {
    run(
      'INSERT INTO controls (tenant_id, code, name, description, category) VALUES (?, ?, ?, ?, ?)',
      tenantId, c.code, c.name, c.description, c.category,
    );
  }

  // Requirements + control→requirement mappings
  for (const [slug, reqs] of Object.entries(requirements)) {
    const fw = get('SELECT id FROM frameworks WHERE tenant_id = ? AND slug = ?', tenantId, slug);
    if (!fw) continue;
    for (const r of reqs) {
      run(
        'INSERT INTO requirements (tenant_id, framework_id, code, title, description, section) VALUES (?, ?, ?, ?, ?, ?)',
        tenantId, fw.id, r.code, r.title, r.description, r.section,
      );
      const reqRow = get(
        'SELECT id FROM requirements WHERE tenant_id = ? AND framework_id = ? AND code = ?',
        tenantId, fw.id, r.code,
      );
      if (!reqRow) continue;
      for (const code of r.controls) {
        const ctrl = get('SELECT id FROM controls WHERE tenant_id = ? AND code = ?', tenantId, code);
        if (ctrl) {
          run(
            'INSERT OR IGNORE INTO control_requirements (tenant_id, control_id, requirement_id) VALUES (?, ?, ?)',
            tenantId, ctrl.id, reqRow.id,
          );
        }
      }
    }
  }

  // Automated tests
  for (const t of tests) {
    const ctrl = get('SELECT id FROM controls WHERE tenant_id = ? AND code = ?', tenantId, t.control);
    if (!ctrl) continue;
    run(
      `INSERT INTO tests (tenant_id, slug, control_id, name, description, remediation, severity, integration, rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tenantId, t.slug, ctrl.id, t.name, t.description, t.remediation, t.severity, t.integration,
      JSON.stringify(t.rule),
    );
  }

  // Integration catalogue (all 'available', no connection data)
  for (const [slug, name, category, description] of integrationCatalog) {
    run(
      `INSERT INTO integrations (tenant_id, slug, name, category, description, status)
       VALUES (?, ?, ?, ?, ?, 'available')`,
      tenantId, slug, name, category, description,
    );
  }
}
