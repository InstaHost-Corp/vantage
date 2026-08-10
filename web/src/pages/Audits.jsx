import { Link } from 'react-router-dom';
import { CalendarDays, FileCheck2, UserCircle2 } from 'lucide-react';
import { useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Progress, Table, Td, formatDate } from '../ui.jsx';

export default function Audits() {
  const { data, loading } = useApi('/audits');
  const { data: evidence } = useApi('/evidence');
  if (loading || !data) return <Loading label="Loading audits" />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit hub"
        description="Run your audit in one place. Give your auditor scoped access, track evidence requests and answer them with automated evidence."
      />

      <div className="grid gap-5 md:grid-cols-2">
        {data.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: a.color }}>{a.short_name}</span>
                  <Pill status={a.status} />
                </div>
                <p className="mt-2 text-base font-semibold">{a.name}</p>
                <p className="text-xs text-ink-500">{a.type} · {a.auditor_firm}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs text-ink-500">
              <p className="flex items-center gap-1.5"><UserCircle2 size={13} /> {a.auditor_name} · {a.auditor_email}</p>
              <p className="flex items-center gap-1.5"><CalendarDays size={13} /> {formatDate(a.period_start)} — {formatDate(a.period_end)}</p>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-500">Evidence requests accepted</span>
                <span className="font-medium">{a.accepted || 0}/{a.requests}</span>
              </div>
              <Progress value={((a.accepted || 0) / Math.max(1, a.requests)) * 100} />
            </div>

            <Link to={`/audits/${a.id}`}><Button variant="secondary" size="sm" className="mt-4 w-full">Open audit</Button></Link>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Evidence library</h2>
            <p className="text-xs text-ink-500">Point-in-time evidence collected for manual controls</p>
          </div>
        </div>
        <Table head={['Evidence', 'Control', 'Type', 'Source', 'Collected', 'Renews']}>
          {(evidence || []).map((e) => (
            <tr key={e.id} className="hover:bg-slate-50/70">
              <Td>
                <span className="flex items-center gap-2 font-medium text-ink-900"><FileCheck2 size={15} className="text-brand-500" /> {e.name}</span>
              </Td>
              <Td>
                {e.control_code && <Link to={`/controls/${e.control_code}`} className="font-mono text-xs text-ink-500 hover:text-brand-600">{e.control_code}</Link>}
              </Td>
              <Td className="text-xs capitalize text-ink-500">{String(e.type).replace('_', ' ')}</Td>
              <Td className="text-xs text-ink-500">{e.source}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(e.collected_at)}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(e.renewal_date)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
