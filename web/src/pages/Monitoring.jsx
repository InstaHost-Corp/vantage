import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Play, Wrench } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, SearchInput, Select, Severity, StatusIcon, Table, Tabs, Td, cx, daysUntil, timeAgo, useToast } from '../ui.jsx';

export default function Monitoring() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const [severity, setSeverity] = useState('');
  const [integration, setIntegration] = useState('');
  const [q, setQ] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  const { data, loading, reload } = useApi('/tests', [version]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    status ? next.set('status', status) : next.delete('status');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const tests = useMemo(() => (data?.tests || []).filter((t) => {
    if (status && t.status !== status) return false;
    if (severity && t.severity !== severity) return false;
    if (integration && t.integration !== integration) return false;
    if (q && !`${t.name} ${t.description} ${t.control_code}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data, status, severity, integration, q]);

  if (loading || !data) return <Loading label="Loading tests" />;

  const remediate = async (test) => {
    setBusy(test.slug);
    try {
      const res = await post(`/tests/${test.slug}/remediate`, {});
      toast(res.count ? `Remediated ${res.count} ${res.count === 1 ? 'entity' : 'entities'} — test is now ${res.test.status === 'ok' ? 'passing' : 'still failing'}` : 'Nothing to remediate');
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const runOne = async (test) => {
    setBusy(test.slug);
    try {
      await post(`/tests/${test.slug}/run`);
      toast(`Re-ran "${test.name}"`);
      setVersion((v) => v + 1);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Monitoring"
        description="Every test runs against fictional demonstration records. Failing tests create an example task with a severity-based target date."
        actions={<Button variant="secondary" onClick={async () => { await post('/tests/run'); setVersion((v) => v + 1); toast('All tests re-run'); }}><Play size={14} /> Run all tests</Button>}
      />

      <Tabs
        className="mb-4"
        active={status}
        onChange={setStatus}
        tabs={[
          { value: '', label: 'All tests', count: data.facets.counts.all },
          { value: 'failing', label: 'Failing', count: data.facets.counts.failing },
          { value: 'ok', label: 'Passing', count: data.facets.counts.ok },
          { value: 'disabled', label: 'Deactivated', count: data.facets.counts.disabled },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search tests…" className="w-72" />
        <Select value={severity} onChange={setSeverity} className="w-44"
          options={[{ value: '', label: 'All severities' }, ...['critical', 'high', 'medium', 'low'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))]} />
        <Select value={integration} onChange={setIntegration} className="w-52"
          options={[{ value: '', label: 'All integrations' }, ...data.facets.integrations.map((i) => ({ value: i, label: i }))]} />
      </div>

      <Card>
        <Table head={['', 'Test', 'Control', 'Severity', 'Entities', 'Deadline', '']}>
          {tests.map((t) => {
            const days = daysUntil(t.deadline);
            return (
              <tr key={t.id} className="hover:bg-slate-50/70">
                <Td className="w-8 pr-0"><StatusIcon status={t.disabled ? 'disabled' : t.status} /></Td>
                <Td>
                  <Link to={`/monitoring/${t.slug}`} className="font-medium text-ink-900 hover:text-brand-600">{t.name}</Link>
                  <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-ink-500">{t.description}</p>
                </Td>
                <Td><Link to={`/controls/${t.control_code}`} className="font-mono text-xs text-ink-500 hover:text-brand-600">{t.control_code}</Link></Td>
                <Td><Severity level={t.severity} /></Td>
                <Td className="whitespace-nowrap text-xs">
                  <span className="text-emerald-600">{t.passing_count} pass</span>
                  {t.failing_count > 0 && <span className="text-rose-600"> · {t.failing_count} fail</span>}
                </Td>
                <Td className={cx('whitespace-nowrap text-xs', days !== null && days <= 3 ? 'font-medium text-rose-600' : 'text-ink-500')}>
                  {t.status !== 'failing' ? timeAgo(t.last_run) : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                </Td>
                <Td className="text-right">
                  {t.status === 'failing' ? (
                    <Button size="sm" loading={busy === t.slug} onClick={() => remediate(t)}><Wrench size={13} /> Fix</Button>
                  ) : (
                    <Button variant="ghost" size="sm" loading={busy === t.slug} onClick={() => runOne(t)}>Run</Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
        {tests.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">No tests match your filters.</p>}
      </Card>
    </div>
  );
}
