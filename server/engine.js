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

// Collect the population of entities a test applies to.
function population(rule) {
  switch (rule.kind) {
    case 'resource': {
      const rows = all('SELECT * FROM resources WHERE type = ?', rule.type);
      return rows.map((r) => ({
        type: 'resource',
        id: r.external_id,
        name: r.name,
        data: { ...JSON.parse(r.metadata || '{}'), name: r.name, region: r.region, owner: r.owner },
      }));
    }
    case 'device': {
      const rows = all(`SELECT d.*, p.name AS person FROM devices d
        JOIN personnel p ON p.id = d.personnel_id WHERE p.status = 'active'`);
      return rows.map((d) => ({ type: 'device', id: `device-${d.id}`, name: `${d.name} (${d.person})`, data: d }));
    }
    case 'personnel': {
      const scope = rule.scope || 'active';
      const rows = scope === 'offboarded'
        ? all("SELECT * FROM personnel WHERE status = 'offboarded'")
        : all("SELECT * FROM personnel WHERE status = 'active'");
      return rows.map((p) => ({ type: 'personnel', id: `person-${p.id}`, name: p.name, data: p }));
    }
    case 'policy': {
      const rows = rule.slug ? all('SELECT * FROM policies WHERE slug = ?', rule.slug) : all('SELECT * FROM policies');
      return rows.map((p) => ({ type: 'policy', id: p.slug, name: p.name, data: p }));
    }
    case 'policy_acceptance': {
      const rows = all(`SELECT p.id, p.name, p.email,
          (SELECT COUNT(*) FROM policies WHERE status = 'approved') AS total,
          (SELECT COUNT(*) FROM policy_acceptances a JOIN policies pol ON pol.id = a.policy_id
            WHERE a.personnel_id = p.id AND pol.status = 'approved') AS accepted
        FROM personnel p WHERE p.status = 'active'`);
      return rows.map((p) => ({
        type: 'personnel', id: `person-${p.id}`, name: p.name,
        data: { ...p, all_accepted: p.accepted >= p.total ? 'yes' : 'no' },
      }));
    }
    case 'vendor': {
      const rows = all("SELECT * FROM vendors WHERE status = 'active'");
      return rows.map((v) => ({ type: 'vendor', id: `vendor-${v.id}`, name: v.name, data: v }));
    }
    case 'risk': {
      const rows = all("SELECT * FROM risks WHERE status != 'closed'");
      return rows.map((r) => ({
        type: 'risk', id: r.code, name: `${r.code} ${r.title}`,
        data: { ...r, overdue: r.due_date && new Date(r.due_date) < new Date() ? 'yes' : 'no' },
      }));
    }
    default:
      return [];
  }
}

export function evaluateTest(test) {
  const rule = JSON.parse(test.rule);
  const entities = population(rule);
  const now = new Date().toISOString();
  return entities.map((e) => {
    const ok = compare(e.data[rule.field], rule.op, rule.value);
    return { ...e, passed: ok, message: describe(rule, ok), checked_at: now };
  });
}

export function runTests({ actor = 'Vantage Agent', testIds = null } = {}) {
  const tests = testIds
    ? all(`SELECT * FROM tests WHERE id IN (${testIds.map(() => '?').join(',')})`, ...testIds)
    : all('SELECT * FROM tests');
  const now = new Date().toISOString();
  let newlyFailing = 0;
  let newlyPassing = 0;

  const insertEntity = db.prepare(
    'INSERT INTO test_entities (test_id, entity_type, entity_id, entity_name, passed, message, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const clearEntities = db.prepare('DELETE FROM test_entities WHERE test_id = ?');

  for (const test of tests) {
    if (test.disabled) {
      run("UPDATE tests SET status = 'disabled', last_run = ? WHERE id = ?", now, test.id);
      continue;
    }
    const results = evaluateTest(test);
    clearEntities.run(test.id);
    for (const r of results) {
      insertEntity.run(test.id, r.type, r.id, r.name, r.passed ? 1 : 0, r.message, r.checked_at);
    }
    const failing = results.filter((r) => !r.passed).length;
    const passing = results.length - failing;
    const status = failing > 0 ? 'failing' : 'ok';

    let deadline = test.deadline;
    if (status === 'failing') {
      if (test.status !== 'failing' || !deadline) {
        const days = SEVERITY_SLA_DAYS[test.severity] ?? 14;
        deadline = new Date(Date.now() + days * 86400000).toISOString();
        newlyFailing++;
        logActivity('test_failed', actor, `Test "${test.name}" started failing (${failing} failing ${failing === 1 ? 'entity' : 'entities'})`);
      }
    } else {
      if (test.status === 'failing') {
        newlyPassing++;
        logActivity('test_passed', actor, `Test "${test.name}" is now passing`);
      }
      deadline = null;
    }

    run('UPDATE tests SET status = ?, failing_count = ?, passing_count = ?, last_run = ?, deadline = ? WHERE id = ?',
      status, failing, passing, now, deadline, test.id);
  }

  return { ran: tests.length, at: now, newlyFailing, newlyPassing };
}

export function controlStatuses() {
  const rows = all(`
    SELECT c.id,
      COUNT(t.id) AS total,
      SUM(CASE WHEN t.status = 'failing' THEN 1 ELSE 0 END) AS failing,
      SUM(CASE WHEN t.status = 'disabled' THEN 1 ELSE 0 END) AS disabled
    FROM controls c LEFT JOIN tests t ON t.control_id = c.id
    GROUP BY c.id`);
  const map = new Map();
  for (const r of rows) {
    const active = (r.total || 0) - (r.disabled || 0);
    let status = 'no_tests';
    if (active > 0) status = r.failing > 0 ? 'failing' : 'passing';
    map.set(r.id, { status, tests: r.total || 0, failing: r.failing || 0 });
  }
  return map;
}

export function frameworkReadiness(frameworkId) {
  const statuses = controlStatuses();
  const reqs = all('SELECT * FROM requirements WHERE framework_id = ? ORDER BY id', frameworkId);
  const links = all(`SELECT cr.requirement_id, cr.control_id FROM control_requirements cr
    JOIN requirements r ON r.id = cr.requirement_id WHERE r.framework_id = ?`, frameworkId);
  const byReq = new Map();
  for (const l of links) {
    if (!byReq.has(l.requirement_id)) byReq.set(l.requirement_id, []);
    byReq.get(l.requirement_id).push(l.control_id);
  }
  const detail = reqs.map((r) => {
    const controlIds = byReq.get(r.id) || [];
    const controls = controlIds.map((id) => ({ id, ...(statuses.get(id) || { status: 'no_tests' }) }));
    const failing = controls.filter((c) => c.status === 'failing').length;
    const untested = controls.filter((c) => c.status === 'no_tests').length;
    let status = 'complete';
    if (controls.length === 0) status = 'unmapped';
    else if (failing > 0) status = 'at_risk';
    else if (untested === controls.length) status = 'in_progress';
    return { ...r, controls, control_count: controls.length, failing, status };
  });
  const complete = detail.filter((d) => d.status === 'complete').length;
  const mapped = new Set(links.map((l) => l.control_id));
  const failingControls = [...mapped].filter((id) => statuses.get(id)?.status === 'failing');
  const readiness = mapped.size ? Math.round(((mapped.size - failingControls.length) / mapped.size) * 100) : 0;
  return {
    readiness,
    requirements: detail,
    complete,
    total: detail.length,
    at_risk: detail.filter((d) => d.status === 'at_risk').length,
    controls_total: mapped.size,
    controls_failing: failingControls.length,
    controls_ok: mapped.size - failingControls.length,
  };
}

export function overallPosture() {
  const tests = all("SELECT status, severity FROM tests WHERE disabled = 0");
  const failing = tests.filter((t) => t.status === 'failing');
  return {
    tests_total: tests.length,
    tests_passing: tests.filter((t) => t.status === 'ok').length,
    tests_failing: failing.length,
    critical_failing: failing.filter((t) => t.severity === 'critical').length,
    high_failing: failing.filter((t) => t.severity === 'high').length,
  };
}
