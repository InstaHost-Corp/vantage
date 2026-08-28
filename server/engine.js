import { all, get, run, db, logActivity } from './db.js';

const SEVERITY_SLA_DAYS = { critical: 3, high: 7, medium: 14, low: 30 };

function compare(actual, op, expected) {
  switch (op) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gte': return Number(actual) >= Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'gt': return Number(actual) > Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
    case 'contains': return String(actual ?? '').includes(String(expected));
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'empty': return actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'before': return new Date(actual) < new Date(expected === 'now' ? Date.now() : expected);
    case 'after': return new Date(actual) > new Date(expected === 'now' ? Date.now() : expected);
    case 'within_days': return actual && (Date.now() - new Date(actual).getTime()) / 86400000 <= Number(expected);
    default: return false;
  }
}

function describe(rule, ok) {
  const human = {
    eq: 'must equal', neq: 'must not equal', gte: 'must be at least', lte: 'must be at most',
    gt: 'must be greater than', lt: 'must be less than', in: 'must be one of', not_in: 'must not be one of',
    contains: 'must contain', exists: 'must be set', empty: 'must be empty',
    before: 'must be before', after: 'must be after', within_days: 'must be updated within (days)',
  }[rule.op] || rule.op;
  const expected = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '');
  return ok
    ? `Compliant — ${rule.field} ${human} ${expected}`
    : `Non-compliant — ${rule.field} ${human} ${expected}`;
}

// Collect the population of entities a test applies to, scoped to a tenant.
function population(rule, tenantId) {
  switch (rule.kind) {
    case 'resource': {
      const rows = all('SELECT * FROM resources WHERE tenant_id = ? AND type = ?', tenantId, rule.type);
      return rows.map((r) => ({
        type: 'resource',
        id: r.external_id,
        name: r.name,
        data: { ...JSON.parse(r.metadata || '{}'), name: r.name, region: r.region, owner: r.owner },
      }));
    }
    case 'device': {
      const rows = all(`SELECT d.*, p.name AS person FROM devices d
        JOIN personnel p ON p.id = d.personnel_id AND p.tenant_id = d.tenant_id
        WHERE d.tenant_id = ? AND p.status = 'active'`, tenantId);
      return rows.map((d) => ({ type: 'device', id: `device-${d.id}`, name: `${d.name} (${d.person})`, data: d }));
    }
    case 'personnel': {
      const scope = rule.scope || 'active';
      const rows = scope === 'offboarded'
        ? all("SELECT * FROM personnel WHERE tenant_id = ? AND status = 'offboarded'", tenantId)
        : all("SELECT * FROM personnel WHERE tenant_id = ? AND status = 'active'", tenantId);
      return rows.map((p) => ({ type: 'personnel', id: `person-${p.id}`, name: p.name, data: p }));
    }
    case 'policy': {
      const rows = rule.slug
        ? all('SELECT * FROM policies WHERE tenant_id = ? AND slug = ?', tenantId, rule.slug)
        : all('SELECT * FROM policies WHERE tenant_id = ?', tenantId);
      return rows.map((p) => ({ type: 'policy', id: p.slug, name: p.name, data: p }));
    }
    case 'policy_acceptance': {
      const rows = all(`SELECT p.id, p.name, p.email,
          (SELECT COUNT(*) FROM policies WHERE tenant_id = ? AND status = 'approved') AS total,
          (SELECT COUNT(*) FROM policy_acceptances a JOIN policies pol ON pol.id = a.policy_id AND pol.tenant_id = a.tenant_id
            WHERE a.tenant_id = p.tenant_id AND a.personnel_id = p.id AND pol.status = 'approved') AS accepted
        FROM personnel p WHERE p.tenant_id = ? AND p.status = 'active'`, tenantId, tenantId);
      return rows.map((p) => ({
        type: 'personnel', id: `person-${p.id}`, name: p.name,
        data: { ...p, all_accepted: p.accepted >= p.total ? 'yes' : 'no' },
      }));
    }
    case 'vendor': {
      const rows = all("SELECT * FROM vendors WHERE tenant_id = ? AND status = 'active'", tenantId);
      return rows.map((v) => ({ type: 'vendor', id: `vendor-${v.id}`, name: v.name, data: v }));
    }
    case 'risk': {
      const rows = all("SELECT * FROM risks WHERE tenant_id = ? AND status != 'closed'", tenantId);
      return rows.map((r) => ({
        type: 'risk', id: r.code, name: `${r.code} ${r.title}`,
        data: { ...r, overdue: r.due_date && new Date(r.due_date) < new Date() ? 'yes' : 'no' },
      }));
    }
    default:
      return [];
  }
}

export function evaluateTest(test, tenantId) {
  const rule = JSON.parse(test.rule);
  const entities = population(rule, tenantId);
  const now = new Date().toISOString();
  return entities.map((e) => {
    const ok = compare(e.data[rule.field], rule.op, rule.value);
    return { ...e, passed: ok, message: describe(rule, ok), checked_at: now };
  });
}

export function runTests({ actor = 'Vantage Agent', testIds = null, tenantId = 1 } = {}) {
  const testsRows = testIds
    ? all(`SELECT * FROM tests WHERE tenant_id = ? AND id IN (${testIds.map(() => '?').join(',')})`, tenantId, ...testIds)
    : all('SELECT * FROM tests WHERE tenant_id = ?', tenantId);
  const now = new Date().toISOString();
  let newlyFailing = 0;
  let newlyPassing = 0;

  const insertEntity = db.prepare(
    'INSERT INTO test_entities (tenant_id, test_id, entity_type, entity_id, entity_name, passed, message, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const clearEntities = db.prepare('DELETE FROM test_entities WHERE test_id = ? AND tenant_id = ?');

  for (const test of testsRows) {
    if (test.disabled) {
      run("UPDATE tests SET status = 'disabled', last_run = ? WHERE id = ? AND tenant_id = ?", now, test.id, tenantId);
      continue;
    }
    const results = evaluateTest(test, tenantId);
    clearEntities.run(test.id, tenantId);
    for (const r of results) {
      insertEntity.run(tenantId, test.id, r.type, r.id, r.name, r.passed ? 1 : 0, r.message, r.checked_at);
    }
    const failing = results.filter((r) => !r.passed).length;
    const passing = results.length - failing;
    // An empty population is not evidence that a control passes. Keep it
    // pending until the tenant has data the rule can actually evaluate.
    const status = results.length === 0 ? 'pending' : failing > 0 ? 'failing' : 'ok';

    let deadline = test.deadline;
    if (status === 'failing') {
      if (test.status !== 'failing' || !deadline) {
        const days = SEVERITY_SLA_DAYS[test.severity] ?? 14;
        deadline = new Date(Date.now() + days * 86400000).toISOString();
        newlyFailing++;
        logActivity('test_failed', actor, `Test "${test.name}" started failing (${failing} failing ${failing === 1 ? 'entity' : 'entities'})`, tenantId);
      }
    } else {
      if (test.status === 'failing') {
        newlyPassing++;
        logActivity('test_passed', actor, `Test "${test.name}" is now passing`, tenantId);
      }
      deadline = null;
    }

    run('UPDATE tests SET status = ?, failing_count = ?, passing_count = ?, last_run = ?, deadline = ? WHERE id = ? AND tenant_id = ?',
      status, failing, passing, now, deadline, test.id, tenantId);
  }

  return { ran: testsRows.length, at: now, newlyFailing, newlyPassing };
}

export function controlStatuses(tenantId = 1) {
  const rows = all(`
    SELECT c.id,
      COUNT(t.id) AS total,
      SUM(CASE WHEN t.status = 'failing' THEN 1 ELSE 0 END) AS failing,
      SUM(CASE WHEN t.status = 'disabled' THEN 1 ELSE 0 END) AS disabled,
      SUM(CASE WHEN t.status = 'ok' THEN 1 ELSE 0 END) AS passing
    FROM controls c LEFT JOIN tests t ON t.control_id = c.id AND t.tenant_id = c.tenant_id
    WHERE c.tenant_id = ?
    GROUP BY c.id`, tenantId);
  const map = new Map();
  for (const r of rows) {
    const active = (r.total || 0) - (r.disabled || 0);
    let status = 'no_tests';
    if (active > 0) status = r.failing > 0 ? 'failing' : r.passing > 0 ? 'passing' : 'no_tests';
    map.set(r.id, { status, tests: r.total || 0, failing: r.failing || 0 });
  }
  return map;
}

export function frameworkReadiness(frameworkId, tenantId = 1) {
  const statuses = controlStatuses(tenantId);
  const reqs = all('SELECT * FROM requirements WHERE tenant_id = ? AND framework_id = ? ORDER BY id', tenantId, frameworkId);
  const links = all(`SELECT cr.requirement_id, cr.control_id FROM control_requirements cr
    JOIN requirements r ON r.id = cr.requirement_id AND r.tenant_id = cr.tenant_id WHERE cr.tenant_id = ? AND r.framework_id = ?`, tenantId, frameworkId);
  const byReq = new Map();
  for (const l of links) {
    if (!byReq.has(l.requirement_id)) byReq.set(l.requirement_id, []);
    byReq.get(l.requirement_id).push(l.control_id);
  }
  const detail = reqs.map((r) => {
    const controlIds = byReq.get(r.id) || [];
    const controlList = controlIds.map((id) => ({ id, ...(statuses.get(id) || { status: 'no_tests' }) }));
    const failCount = controlList.filter((c) => c.status === 'failing').length;
    const untested = controlList.filter((c) => c.status === 'no_tests').length;
    let reqStatus = 'complete';
    if (controlList.length === 0) reqStatus = 'unmapped';
    else if (failCount > 0) reqStatus = 'at_risk';
    else if (untested > 0) reqStatus = 'in_progress';
    return { ...r, controls: controlList, control_count: controlList.length, failing: failCount, status: reqStatus };
  });
  const complete = detail.filter((d) => d.status === 'complete').length;
  const mapped = new Set(links.map((l) => l.control_id));
  const failingControls = [...mapped].filter((id) => statuses.get(id)?.status === 'failing');
  const passingControls = [...mapped].filter((id) => statuses.get(id)?.status === 'passing');
  const readiness = mapped.size ? Math.round((passingControls.length / mapped.size) * 100) : 0;
  return {
    readiness,
    requirements: detail,
    complete,
    total: detail.length,
    at_risk: detail.filter((d) => d.status === 'at_risk').length,
    controls_total: mapped.size,
    controls_failing: failingControls.length,
    controls_ok: passingControls.length,
  };
}

export function overallPosture(tenantId = 1) {
  const testsRows = all("SELECT status, severity FROM tests WHERE tenant_id = ? AND disabled = 0", tenantId);
  const failing = testsRows.filter((t) => t.status === 'failing');
  return {
    tests_total: testsRows.length,
    tests_passing: testsRows.filter((t) => t.status === 'ok').length,
    tests_failing: failing.length,
    critical_failing: failing.filter((t) => t.severity === 'critical').length,
    high_failing: failing.filter((t) => t.severity === 'high').length,
  };
}
