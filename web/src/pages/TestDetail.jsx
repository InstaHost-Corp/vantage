import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, PauseCircle, PlayCircle, Wrench } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Severity, StatusIcon, Table, Td, cx, daysUntil, formatDate, timeAgo, useToast } from '../ui.jsx';

export default function TestDetail() {
  const { slug } = useParams();
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi(`/tests/${slug}`, [version]);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading test" />;
  const days = daysUntil(data.deadline);

  const act = async (fn, id) => {
    setBusy(id);
    try { await fn(); setVersion((v) => v + 1); } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  };

  const remediateAll = () => act(async () => {
    const res = await post(`/tests/${slug}/remediate`, {});
    toast(res.count ? `Remediated ${res.count} ${res.count === 1 ? 'entity' : 'entities'}` : 'Nothing to remediate');
  }, 'all');

  const remediateOne = (entityId, name) => act(async () => {
    await post(`/tests/${slug}/remediate`, { entity_id: entityId });
    toast(`Remediated ${name}`);
  }, entityId);

  const failing = data.entities.filter((e) => !e.passed);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={<Link to="/monitoring" className="mb-1 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">Monitoring <ChevronRight size={12} /> {data.integration}</Link>}
        title={data.name}
        description={data.description}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" loading={busy === 'run'} onClick={() => act(async () => { await post(`/tests/${slug}/run`); toast('Test re-run'); }, 'run')}>
              <PlayCircle size={15} /> Run now
            </Button>
            <Button variant="secondary" loading={busy === 'toggle'} onClick={() => act(async () => {
              const res = await post(`/tests/${slug}/toggle`);
              toast(res.disabled ? 'Test deactivated' : 'Test reactivated');
            }, 'toggle')}>
              <PauseCircle size={15} /> {data.disabled ? 'Reactivate' : 'Deactivate'}
            </Button>
            {failing.length > 0 && <Button loading={busy === 'all'} onClick={remediateAll}><Wrench size={15} /> Fix all {failing.length}</Button>}
          </div>
        }
      />

      <div className="grid gap-5 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Status</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusIcon status={data.disabled ? 'disabled' : data.status} size={20} />
            <Pill status={data.disabled ? 'disabled' : data.status} />
          </div>
          <p className="mt-2 text-xs text-ink-500">Last run {timeAgo(data.last_run)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Severity</p>
          <div className="mt-2"><Severity level={data.severity} /></div>
          <p className="mt-2 text-xs text-ink-500">
            {data.status === 'failing' && data.deadline
              ? days < 0 ? `${Math.abs(days)} days overdue` : `Remediate within ${days} days`
              : 'Within SLA'}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Entities</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{data.entities.length}</p>
          <p className="mt-1 text-xs text-ink-500">
            <span className="text-emerald-600">{data.passing_count} passing</span>
            {data.failing_count > 0 && <span className="text-rose-600"> · {data.failing_count} failing</span>}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Control</p>
          <Link to={`/controls/${data.control_code}`} className="mt-2 block text-sm font-medium text-brand-600 hover:underline">
            {data.control_code} {data.control_name}
          </Link>
          <p className="mt-1 text-xs text-ink-500">{data.control_category}</p>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Remediation guidance</p>
        <p className="mt-2 text-sm text-ink-700">{data.remediation}</p>
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-ink-600">
          rule: {JSON.stringify(data.rule)}
        </div>
      </Card>

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Evaluated entities</h2>
          <span className="text-xs text-ink-500">Checked {timeAgo(data.last_run)}</span>
        </div>
        <Table head={['', 'Entity', 'Type', 'Result', '']}>
          {data.entities.map((e) => (
            <tr key={e.id} className={cx('hover:bg-slate-50/70', !e.passed && 'bg-rose-50/40')}>
              <Td className="w-8 pr-0"><StatusIcon status={e.passed ? 'passing' : 'failing'} /></Td>
              <Td className="font-medium text-ink-900">{e.entity_name}</Td>
              <Td className="text-xs text-ink-500">{e.entity_type}</Td>
              <Td className="text-xs text-ink-600">{e.message}</Td>
              <Td className="text-right">
                {!e.passed && <Button size="sm" variant="secondary" loading={busy === e.entity_id} onClick={() => remediateOne(e.entity_id, e.entity_name)}>Fix</Button>}
              </Td>
            </tr>
          ))}
        </Table>
        {data.entities.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-500">
            No entities of this type are currently in scope, so this test passes by default.
          </p>
        )}
      </Card>
    </div>
  );
}
