import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Download } from 'lucide-react';
import { useApi } from '../api.js';
import { Button, Card, Donut, Loading, PageHeader, Pill, Progress, StatusIcon, cx, formatDate, useToast } from '../ui.jsx';

export default function FrameworkDetail() {
  const { slug } = useParams();
  const { data, loading } = useApi(`/frameworks/${slug}`);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState('all');
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading framework" />;
  const { framework: f } = data;

  const exportReadiness = () => {
    const rows = [['Requirement', 'Title', 'Section', 'Status', 'Controls', 'Failing controls']];
    for (const s of data.sections) {
      for (const r of s.requirements) rows.push([r.code, r.title, s.section, r.status, r.control_count, r.failing]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-readiness.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Readiness report exported');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={<Link to="/frameworks" className="mb-1 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">Frameworks <ChevronRight size={12} /> {f.short_name}</Link>}
        title={f.name}
        description={f.description}
        actions={<Button variant="secondary" onClick={exportReadiness}><Download size={15} /> Export readiness</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="flex flex-col items-center justify-center p-6">
          <Donut value={data.readiness} color={f.color} sublabel="Ready" />
          <p className="mt-3 text-center text-xs text-ink-500">
            {data.controls_ok} of {data.controls_total} mapped controls are passing
          </p>
        </Card>
        <Card className="p-6 lg:col-span-3">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              ['Requirements', data.total, 'in this framework'],
              ['At risk', data.at_risk, 'have a failing control'],
              ['Failing controls', data.controls_failing, 'need remediation'],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
                <p className={cx('mt-1 text-3xl font-semibold tabular-nums', label !== 'Requirements' && value > 0 && 'text-rose-600')}>{value}</p>
                <p className="text-xs text-ink-500">{sub}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="mb-1 flex justify-between text-xs text-ink-500">
              <span>Control coverage</span>
              <span>{data.readiness}%</span>
            </div>
            <Progress value={data.readiness} tone={data.readiness >= 85 ? 'bg-emerald-500' : undefined} />
          </div>
          {f.target_date && <p className="mt-4 text-xs text-ink-500">Target audit date {formatDate(f.target_date)} · Status <Pill status={f.audit_status} className="ml-1" /></p>}
        </Card>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {[['all', 'All requirements'], ['at_risk', 'At risk'], ['complete', 'Complete']].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)}
            className={cx('rounded-full px-3 py-1.5 text-xs font-medium transition',
              filter === value ? 'bg-ink-900 text-white' : 'border border-slate-300 bg-white text-ink-700 hover:bg-slate-50')}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-6">
        {data.sections.map((section) => {
          const requirements = section.requirements.filter((r) => filter === 'all' || r.status === filter);
          if (!requirements.length) return null;
          return (
            <Card key={section.section}>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h2 className="text-sm font-semibold">{section.section}</h2>
                <span className="text-xs text-ink-500">{requirements.length} requirements</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {requirements.map((r) => {
                  const isOpen = open[r.code];
                  return (
                    <li key={r.code}>
                      <button onClick={() => setOpen((o) => ({ ...o, [r.code]: !o[r.code] }))}
                        className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50/70">
                        <StatusIcon status={r.status === 'complete' ? 'passing' : r.status} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-ink-500">{r.code}</span>
                            <span className="text-sm font-medium text-ink-900">{r.title}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{r.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Pill status={r.status} />
                          <ChevronRight size={15} className={cx('text-slate-400 transition-transform', isOpen && 'rotate-90')} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="animate-fade-up border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                          <p className="mb-3 text-sm text-ink-700">{r.description}</p>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Mapped controls</p>
                          {r.controls.length === 0 ? (
                            <p className="text-sm text-ink-500">No controls mapped to this requirement yet.</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {r.controls.map((c) => (
                                <Link key={c.id} to={`/controls/${c.code}`}
                                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-brand-300">
                                  <StatusIcon status={c.status} size={15} />
                                  <span className="font-mono text-xs text-ink-500">{c.code}</span>
                                  <span className="truncate text-ink-900">{c.name}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
