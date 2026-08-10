import { useState } from 'react';
import { patch, useApi } from '../api.js';
import { Button, Card, Drawer, Loading, PageHeader, Pill, Select, Table, Td, cx, formatDate, useToast } from '../ui.jsx';

const LEVELS = [1, 2, 3, 4, 5];
const scoreTone = (score) => (score >= 15 ? 'bg-rose-500' : score >= 9 ? 'bg-amber-500' : score >= 4 ? 'bg-yellow-400' : 'bg-emerald-500');
const scoreLabel = (score) => (score >= 15 ? 'Critical' : score >= 9 ? 'High' : score >= 4 ? 'Moderate' : 'Low');

export default function Risks() {
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi('/risks', [version]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading risk register" />;

  const matrix = LEVELS.map((impact) => LEVELS.map((likelihood) =>
    data.filter((r) => r.status === 'open' && r.residual_impact === impact && r.residual_likelihood === likelihood)));

  const categories = Object.entries(
    data.filter((r) => r.status === 'open').reduce((acc, r) => { (acc[r.category] ||= []).push(r); return acc; }, {})
  ).sort((a, b) => b[1].length - a[1].length);

  const update = async (code, body, message) => {
    setBusy(true);
    try {
      await patch(`/risks/${code}`, body);
      toast(message);
      setVersion((v) => v + 1);
      setSelected(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Risk register"
        description="Identify, score and treat information security risks. Residual scores update as mitigating controls come into effect."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Residual risk heat map</h2>
          <p className="mt-0.5 text-xs text-ink-500">Open risks after treatment</p>
          <p className="mt-4 text-[10px] uppercase tracking-wide text-ink-500">Impact &uarr;</p>
          <div className="mt-1 flex gap-2">
            <div className="grid grid-cols-1 gap-1 text-[10px] font-medium text-ink-500">
              {[...LEVELS].reverse().map((l) => <span key={l} className="flex h-9 items-center justify-end">{l}</span>)}
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-1">
                {[...matrix].reverse().map((row, i) => row.map((cell, j) => {
                  const score = (5 - i) * (j + 1);
                  return (
                    <div key={`${i}-${j}`} title={`Impact ${5 - i} \u00d7 Likelihood ${j + 1}`}
                      className={cx('flex h-9 items-center justify-center rounded text-xs font-semibold text-white', scoreTone(score), cell.length === 0 && 'opacity-25')}>
                      {cell.length || ''}
                    </div>
                  );
                }))}
              </div>
              <div className="mt-1 grid grid-cols-5 gap-1 text-center text-[10px] font-medium text-ink-500">
                {LEVELS.map((l) => <span key={l}>{l}</span>)}
              </div>
              <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-ink-500">Likelihood &rarr;</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {[['Critical', 'bg-rose-500'], ['High', 'bg-amber-500'], ['Moderate', 'bg-yellow-400'], ['Low', 'bg-emerald-500']].map(([label, tone]) => (
              <div key={label} className="flex items-center gap-2"><span className={cx('h-2.5 w-2.5 rounded-sm', tone)} /><span className="text-ink-500">{label}</span></div>
            ))}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Risk by category</h2>
          <p className="mt-0.5 text-xs text-ink-500">Open risks grouped by category, sized by residual score</p>
          <div className="mt-4 space-y-3">
            {categories.map(([category, items]) => {
              const worst = Math.max(...items.map((r) => r.residual_score));
              return (
                <div key={category}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-900">{category}</span>
                    <span className="text-ink-500">{items.length} open · highest residual {worst}</span>
                  </div>
                  <div className="flex gap-1">
                    {items.map((r) => (
                      <button key={r.code} onClick={() => setSelected(r)} title={`${r.code} ${r.title}`}
                        className={cx('h-6 flex-1 rounded text-[10px] font-semibold text-white transition hover:opacity-80', scoreTone(r.residual_score))}>
                        {r.code}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Risks</h2>
          <span className="text-xs text-ink-500">{data.filter((r) => r.status === 'open').length} open · {data.filter((r) => r.overdue).length} overdue</span>
        </div>
        <Table head={['Risk', 'Category', 'Inherent', 'Residual', 'Treatment', 'Owner', 'Due']}>
          {data.map((r) => (
            <tr key={r.code} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setSelected(r)}>
              <Td>
                <p className="font-medium text-ink-900"><span className="mr-2 whitespace-nowrap font-mono text-xs text-ink-500">{r.code}</span>{r.title}</p>
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{r.category}</Td>
              <Td>
                <span className={cx('inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white', scoreTone(r.inherent_score))}>{r.inherent_score}</span>
              </Td>
              <Td>
                <span className={cx('inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white', scoreTone(r.residual_score))}>{r.residual_score}</span>
              </Td>
              <Td className="text-xs capitalize text-ink-500">{r.treatment}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{r.owner}</Td>
              <Td className={cx('whitespace-nowrap text-xs', r.overdue ? 'font-medium text-rose-600' : 'text-ink-500')}>
                {r.status === 'closed' ? <Pill status="closed" /> : formatDate(r.due_date)}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title} subtitle={`${selected?.code} · ${selected?.category}`}>
        {selected && (
          <>
            <p className="text-sm text-ink-700">{selected.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-ink-500">Inherent risk</p>
                <p className="mt-1 text-2xl font-semibold">{selected.inherent_score} <span className="text-sm font-normal text-ink-500">{scoreLabel(selected.inherent_score)}</span></p>
                <p className="mt-1 text-xs text-ink-500">Likelihood {selected.likelihood} × Impact {selected.impact}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-ink-500">Residual risk</p>
                <p className="mt-1 text-2xl font-semibold">{selected.residual_score} <span className="text-sm font-normal text-ink-500">{scoreLabel(selected.residual_score)}</span></p>
                <p className="mt-1 text-xs text-ink-500">Likelihood {selected.residual_likelihood} × Impact {selected.residual_impact}</p>
              </Card>
            </div>

            <h3 className="mt-6 mb-1 text-sm font-semibold">Mitigation</h3>
            <p className="text-sm text-ink-700">{selected.mitigation}</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">Treatment</span>
                <Select value={selected.treatment} onChange={(v) => update(selected.code, { treatment: v }, 'Treatment updated')}
                  options={['mitigate', 'accept', 'transfer', 'avoid', 'undecided'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">Status</span>
                <Select value={selected.status} onChange={(v) => update(selected.code, { status: v }, 'Status updated')}
                  options={['open', 'closed'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} />
              </label>
            </div>

            {selected.overdue && (
              <Card className="mt-6 border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-800">Remediation is overdue</p>
                <p className="mt-1 text-xs text-rose-700">Due {formatDate(selected.due_date)}. Agree a revised date with the risk owner.</p>
                <Button className="mt-3" size="sm" loading={busy}
                  onClick={() => update(selected.code, { due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }, 'Due date extended by 30 days')}>
                  Extend by 30 days
                </Button>
              </Card>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
