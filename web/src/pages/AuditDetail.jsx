import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Send, Upload } from 'lucide-react';
import { patch, useApi } from '../api.js';
import { Button, Card, Donut, Loading, PageHeader, Pill, Table, Td, cx, daysUntil, formatDate, useToast } from '../ui.jsx';

export default function AuditDetail() {
  const { id } = useParams();
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi(`/audits/${id}`, [version]);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading audit" />;

  const update = async (request, status) => {
    setBusy(request.id);
    try {
      await patch(`/audit-requests/${request.id}`, { status, evidence_count: status === 'submitted' ? Math.max(1, request.evidence_count) : request.evidence_count });
      toast(`${request.ref} marked ${status}`);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const accepted = data.requests.filter((r) => r.status === 'accepted').length;
  const open = data.requests.filter((r) => r.status === 'open').length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={<Link to="/audits" className="mb-1 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">Audit hub <ChevronRight size={12} /> {data.short_name}</Link>}
        title={data.name}
        description={`${data.type} audit performed by ${data.auditor_firm}. Observation window ${formatDate(data.period_start)} to ${formatDate(data.period_end)}.`}
        actions={<Button variant="secondary" onClick={() => toast('Auditor invited — they receive scoped read-only access')}><Send size={15} /> Invite auditor</Button>}
      />

      <div className="grid gap-5 md:grid-cols-4">
        <Card className="flex items-center justify-center p-5">
          <Donut value={data.readiness} size={112} color={data.color} sublabel="Ready" />
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-500">Requests accepted</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{accepted}/{data.requests.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-500">Open requests</p>
          <p className={cx('mt-1 text-2xl font-semibold tabular-nums', open > 0 && 'text-amber-600')}>{open}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-500">Auditor</p>
          <p className="mt-1 text-sm font-medium">{data.auditor_name}</p>
          <p className="text-xs text-ink-500">{data.auditor_email}</p>
          <div className="mt-2"><Pill status={data.status} /></div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Evidence requests</h2>
          <p className="text-xs text-ink-500">Requested by the audit team (PBC list)</p>
        </div>
        <Table head={['Ref', 'Request', 'Evidence', 'Status', 'Due', '']}>
          {data.requests.map((r) => {
            const days = daysUntil(r.due_date);
            return (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <Td className="font-mono text-xs text-ink-500">{r.ref}</Td>
                <Td>
                  <p className="font-medium text-ink-900">{r.name}</p>
                  <p className="mt-0.5 max-w-lg text-xs text-ink-500">{r.description}</p>
                </Td>
                <Td className="text-xs text-ink-500">{r.evidence_count} items</Td>
                <Td><Pill status={r.status} /></Td>
                <Td className={cx('whitespace-nowrap text-xs', days !== null && days < 0 && r.status === 'open' ? 'font-medium text-rose-600' : 'text-ink-500')}>
                  {formatDate(r.due_date)}
                </Td>
                <Td className="text-right">
                  {r.status === 'open' && (
                    <Button size="sm" loading={busy === r.id} onClick={() => update(r, 'submitted')}><Upload size={13} /> Submit</Button>
                  )}
                  {r.status === 'submitted' && (
                    <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => update(r, 'accepted')}>Mark accepted</Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
