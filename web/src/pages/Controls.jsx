import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api.js';
import { Avatar, Card, Loading, PageHeader, Pill, SearchInput, Select, StatusIcon, Table, Td, cx } from '../ui.jsx';

export default function Controls() {
  const { data, loading } = useApi('/controls');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');

  const categories = useMemo(() => [...new Set((data || []).map((c) => c.category))].sort(), [data]);
  const filtered = useMemo(() => (data || []).filter((c) => {
    if (category && c.category !== category) return false;
    if (status && c.status !== status) return false;
    if (q && !`${c.code} ${c.name} ${c.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data, q, category, status]);

  if (loading || !data) return <Loading label="Loading controls" />;

  const counts = {
    passing: data.filter((c) => c.status === 'passing').length,
    failing: data.filter((c) => c.status === 'failing').length,
    manual: data.filter((c) => c.status === 'no_tests').length,
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Controls"
        description="Your single control set. Each control is mapped to the framework requirements it satisfies and assessed from workspace records."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[['Passing', counts.passing, 'text-emerald-600'], ['Failing', counts.failing, 'text-rose-600'], ['Manual evidence', counts.manual, 'text-ink-900']].map(([label, value, tone]) => (
          <Card key={label} className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-ink-500">{label}</span>
            <span className={cx('text-2xl font-semibold tabular-nums', tone)}>{value}</span>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search controls…" className="w-72" />
        <Select value={category} onChange={setCategory} className="w-56"
          options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
        <Select value={status} onChange={setStatus} className="w-48"
          options={[{ value: '', label: 'All statuses' }, { value: 'passing', label: 'Passing' }, { value: 'failing', label: 'Failing' }, { value: 'no_tests', label: 'Manual' }]} />
      </div>

      <Card>
        <Table head={['', 'Control', 'Category', 'Owner', 'Tests', 'Frameworks']}>
          {filtered.map((c) => (
            <tr key={c.code} className="hover:bg-slate-50/70">
              <Td className="w-8 pr-0"><StatusIcon status={c.status} /></Td>
              <Td>
                <Link to={`/controls/${c.code}`} className="font-medium text-ink-900 hover:text-brand-600">
                  <span className="mr-2 font-mono text-xs text-ink-500">{c.code}</span>{c.name}
                </Link>
                <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-ink-500">{c.description}</p>
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{c.category}</Td>
              <Td>
                <span className="flex items-center gap-2 text-xs text-ink-700"><Avatar name={c.owner} size="sm" />{c.owner}</span>
              </Td>
              <Td className="whitespace-nowrap text-xs">
                {c.tests === 0 ? <span className="text-ink-500">Manual</span>
                  : <span className={cx(c.failing > 0 ? 'text-rose-600' : 'text-emerald-600')}>{c.tests - c.failing}/{c.tests} passing</span>}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {c.frameworks.map((f) => (
                    <span key={f.slug} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: f.color }}>{f.short_name}</span>
                  ))}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">No controls match your filters.</p>}
      </Card>
    </div>
  );
}
