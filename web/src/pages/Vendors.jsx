import { useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, ShieldCheck } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Button, Card, Drawer, Loading, PageHeader, Pill, SearchInput, Select, Table, Td, cx, formatDate, useToast } from '../ui.jsx';

const RISK_STYLES = { high: 'bg-rose-50 text-rose-700 ring-rose-600/20', medium: 'bg-amber-50 text-amber-700 ring-amber-600/20', low: 'bg-slate-100 text-ink-600 ring-slate-500/20' };

export default function Vendors() {
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi('/vendors', [version]);
  const [q, setQ] = useState('');
  const [risk, setRisk] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  const filtered = useMemo(() => (data || []).filter((v) => {
    if (risk && v.risk_level !== risk) return false;
    if (q && !`${v.name} ${v.category} ${v.data_processed}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data, q, risk]);

  if (loading || !data) return <Loading label="Loading vendors" />;

  const review = async (vendor) => {
    setBusy(vendor.id);
    try {
      await post(`/vendors/${vendor.id}/review`);
      toast(`Security review completed for ${vendor.name}`);
      setVersion((v) => v + 1);
      setSelected(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const reviewed = data.filter((v) => v.security_review_status === 'complete').length;
  const spend = data.reduce((a, v) => a + v.annual_cost, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Vendor risk management"
        description="Inventory of third parties and sub-processors, with risk tiering and recurring security reviews."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Vendors</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.length}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Reviews complete</p><p className="mt-1 text-2xl font-semibold tabular-nums">{reviewed}/{data.length}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">High risk</p><p className="mt-1 text-2xl font-semibold tabular-nums text-rose-600">{data.filter((v) => v.risk_level === 'high').length}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Annual spend</p><p className="mt-1 text-2xl font-semibold tabular-nums">${(spend / 1000).toFixed(0)}k</p></Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search vendors…" className="w-72" />
        <Select value={risk} onChange={setRisk} className="w-44"
          options={[{ value: '', label: 'All risk levels' }, { value: 'high', label: 'High risk' }, { value: 'medium', label: 'Medium risk' }, { value: 'low', label: 'Low risk' }]} />
      </div>

      <Card>
        <Table head={['Vendor', 'Category', 'Risk', 'Data processed', 'Review', 'Certifications', 'Next review']}>
          {filtered.map((v) => (
            <tr key={v.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setSelected(v)}>
              <Td>
                <p className="font-medium text-ink-900">{v.name}</p>
                <p className="text-xs text-ink-500">{v.website}{v.subprocessor ? ' · sub-processor' : ''}</p>
              </Td>
              <Td className="text-xs text-ink-500">{v.category}</Td>
              <Td><span className={cx('rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', RISK_STYLES[v.risk_level])}>{v.risk_level}</span></Td>
              <Td className="max-w-48 truncate text-xs text-ink-500">{v.data_processed}</Td>
              <Td><Pill status={v.security_review_status} /></Td>
              <Td>
                <div className="flex gap-1">
                  {v.soc2 && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">SOC 2</span>}
                  {v.iso27001 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">ISO 27001</span>}
                </div>
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(v.next_review)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name} subtitle={selected?.category}>
        {selected && (
          <>
            <p className="text-sm text-ink-700">{selected.description}</p>
            <div className="mt-4 flex gap-2">
              {selected.security_review_status !== 'complete' && (
                <Button loading={busy === selected.id} onClick={() => review(selected)}><ShieldCheck size={15} /> Complete security review</Button>
              )}
              <a href={`https://${selected.website}`} target="_blank" rel="noreferrer">
                <Button variant="secondary">Visit site <ExternalLink size={14} /></Button>
              </a>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              {[
                ['Risk level', selected.risk_level], ['Owner', selected.owner], ['Data processed', selected.data_processed],
                ['Sub-processor', selected.subprocessor ? 'Yes — listed publicly' : 'No'],
                ['Last reviewed', formatDate(selected.last_reviewed)], ['Next review', formatDate(selected.next_review)],
                ['Annual cost', `$${selected.annual_cost.toLocaleString()}`], ['Status', selected.status],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd className="mt-0.5 font-medium capitalize text-ink-900">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-8 mb-2 text-sm font-semibold">Assurance</h3>
            <div className="flex gap-2">
              {selected.soc2 && <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"><BadgeCheck size={14} /> SOC 2 Type II on file</span>}
              {selected.iso27001 && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><BadgeCheck size={14} /> ISO 27001 certified</span>}
              {!selected.soc2 && !selected.iso27001 && <p className="text-sm text-ink-500">No third-party assurance reports on file. A questionnaire is required.</p>}
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
