import { Link } from 'react-router-dom';
import {
  Activity, ArrowUpRight, Boxes, Building2, ClipboardCheck, Monitor, ScrollText, TriangleAlert, Users,
} from 'lucide-react';
import { useApi } from '../api.js';
import {
  Button, Card, Donut, Loading, PageHeader, Pill, Progress, Severity, Stat, Table, Td, cx, daysUntil, formatDate, timeAgo,
} from '../ui.jsx';

export default function Dashboard() {
  const { data, loading } = useApi('/dashboard');
  if (loading || !data) return <Loading label="Loading dashboard" />;

  const { posture, frameworks, failing_tests: failing, people, devices, vendors, risks, audit } = data;
  const testPct = posture.tests_total ? Math.round((posture.tests_passing / posture.tests_total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Compliance overview"
        description="Workspace posture across enabled frameworks, computed from the records available in Vantage."
        actions={<Link to="/monitoring?status=failing"><Button variant="secondary" size="md"><Activity size={15} /> View failing tests</Button></Link>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-8">
            <div className="text-center">
              <Donut value={data.overall_readiness} sublabel="Ready" />
              <p className="mt-3 text-xs text-ink-500">Average across {frameworks.length} frameworks</p>
            </div>
            <div className="min-w-64 flex-1 space-y-4">
              {frameworks.map((f) => (
                <Link key={f.slug} to={`/frameworks/${f.slug}`} className="block group">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-ink-900 group-hover:text-brand-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                      {f.short_name}
                    </span>
                    <span className="tabular-nums text-ink-500">
                      {f.controls_ok}/{f.controls_total} controls · <span className="font-semibold text-ink-900">{f.readiness}%</span>
                    </span>
                  </div>
                  <Progress value={f.readiness} tone={f.readiness >= 85 ? 'bg-emerald-500' : undefined} />
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Automated tests</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight">{posture.tests_passing}</span>
              <span className="text-sm text-ink-500">of {posture.tests_total} passing</span>
            </div>
            <Progress value={testPct} className="mt-3" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {data.failing_by_severity.map((s) => (
              <div key={s.severity} className="rounded-lg border border-slate-200 px-3 py-2">
                <Severity level={s.severity} />
                <p className="mt-1.5 text-lg font-semibold tabular-nums">{s.count}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-500">
            Showing {data.monitored_resources} workspace resources and {data.integrations.configured} configured service references.
          </p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Personnel compliant" value={`${people.training_pct}%`} icon={Users}
          tone={people.training_pct >= 90 ? 'good' : 'warn'}
          sub={`${people.trained}/${people.active} completed security training`} />
        <Stat label="Policy acceptance" value={`${data.policy_acceptance_pct}%`} icon={ScrollText}
          tone={data.policy_acceptance_pct >= 90 ? 'good' : 'warn'} sub="Active personnel accepting all policies" />
        <Stat label="Devices compliant" value={`${devices.compliant}/${devices.total}`} icon={Monitor}
          tone={devices.compliant === devices.total ? 'good' : 'warn'} sub="Encrypted, locked, patched and protected" />
        <Stat label="Vendors reviewed" value={`${vendors.reviewed}/${vendors.total}`} icon={Building2}
          tone={vendors.reviewed === vendors.total ? 'good' : 'warn'} sub={`${vendors.high_risk} high-risk vendors in scope`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">Failing tests</h2>
              <p className="text-xs text-ink-500">Ordered by severity and remediation deadline</p>
            </div>
            <Link to="/monitoring?status=failing" className="text-xs font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          {failing.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-500">Every automated test is passing. Nice work.</div>
          ) : (
            <Table head={['Test', 'Control', 'Severity', 'Failing', 'Due']}>
              {failing.map((t) => {
                const days = daysUntil(t.deadline);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <Td>
                      <Link to={`/monitoring/${t.slug}`} className="font-medium text-ink-900 hover:text-brand-600">{t.name}</Link>
                      <p className="text-xs text-ink-500">{t.integration}</p>
                    </Td>
                    <Td><Link to={`/controls/${t.control_code}`} className="text-xs text-ink-500 hover:text-brand-600">{t.control_code}</Link></Td>
                    <Td><Severity level={t.severity} /></Td>
                    <Td className="tabular-nums text-ink-700">{t.failing_count}</Td>
                    <Td className={cx('whitespace-nowrap text-xs', days !== null && days <= 3 ? 'font-medium text-rose-600' : 'text-ink-500')}>
                      {days === null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          {audit && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                <ClipboardCheck size={14} /> Active audit
              </div>
              <p className="mt-2 font-semibold">{audit.name}</p>
              <p className="text-xs text-ink-500">{audit.auditor_firm} · {audit.auditor_name}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                <span>Evidence requests</span>
                <span className="font-medium text-ink-900">{audit.accepted}/{audit.total} accepted</span>
              </div>
              <Progress value={(audit.accepted / Math.max(1, audit.total)) * 100} className="mt-1.5" />
              <p className="mt-3 text-xs text-ink-500">Observation window ends {formatDate(audit.period_end)}</p>
              <Link to={`/audits/${audit.id}`}><Button variant="secondary" size="sm" className="mt-4 w-full">Open audit hub <ArrowUpRight size={14} /></Button></Link>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-500">
              <TriangleAlert size={14} /> Risk register
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[['Total', risks.total, ''], ['Open', risks.open, 'text-amber-600'], ['Overdue', risks.overdue, 'text-rose-600']].map(([label, value, tone]) => (
                <div key={label} className="rounded-lg bg-slate-50 py-2">
                  <p className={cx('text-lg font-semibold tabular-nums', tone)}>{value}</p>
                  <p className="text-[11px] text-ink-500">{label}</p>
                </div>
              ))}
            </div>
            <Link to="/risks"><Button variant="secondary" size="sm" className="mt-4 w-full">Open risk register</Button></Link>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Recent activity</p>
            <ul className="mt-3 space-y-3">
              {data.activity.slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-2.5 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <div>
                    <p className="text-ink-700">{a.message}</p>
                    <p className="text-ink-500">{a.actor} · {timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-4 bg-brand-50/60 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-600"><Boxes size={18} /></span>
          <div>
            <p className="text-sm font-semibold">{data.monitored_resources} workspace resource records</p>
            <p className="text-xs text-ink-500">Last scan {timeAgo(data.last_run)} · {data.integrations.configured} of {data.integrations.total} service references configured</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/inventory"><Button variant="secondary" size="sm">Inventory</Button></Link>
          <Link to="/integrations"><Button size="sm">Manage integrations</Button></Link>
        </div>
      </Card>
    </div>
  );
}
