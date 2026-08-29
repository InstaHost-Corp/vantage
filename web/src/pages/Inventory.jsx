import { useMemo, useState } from 'react';
import { useApi } from '../api.js';
import { Card, Loading, PageHeader, SearchInput, Select, Table, Td, cx, titleCase } from '../ui.jsx';

export default function Inventory() {
  const { data, loading } = useApi('/resources');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  const rows = useMemo(() => (data?.resources || []).filter((r) => {
    if (type && r.type !== type) return false;
    if (q && !`${r.name} ${r.external_id} ${r.owner} ${r.region}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data, q, type]);

  if (loading || !data) return <Loading label="Loading inventory" />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Inventory"
        description="Workspace inventory records and their configuration attributes evaluated by your tests."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search resources…" className="w-72" />
        <Select value={type} onChange={setType} className="w-64"
          options={[{ value: '', label: `All types (${data.total})` }, ...data.types.map((t) => ({ value: t, label: titleCase(t) }))]} />
        <span className="text-xs text-ink-500">{rows.length} resources</span>
      </div>

      <Card>
        <Table head={['Resource', 'Type', 'Source', 'Region', 'Owner', 'Configuration']}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70">
              <Td>
                <p className="font-medium text-ink-900">{r.name}</p>
                <p className="font-mono text-[11px] text-ink-500">{r.external_id}</p>
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{titleCase(r.type)}</Td>
              <Td className="text-xs uppercase text-ink-500">{r.integration}</Td>
              <Td className="text-xs text-ink-500">{r.region || '—'}</Td>
              <Td className="text-xs text-ink-500">{r.owner || '—'}</Td>
              <Td>
                <div className="flex max-w-md flex-wrap gap-1">
                  {Object.entries(r.metadata).map(([key, value]) => (
                    <span key={key} className={cx('rounded px-1.5 py-0.5 text-[10px] font-medium',
                      value === false ? 'bg-rose-50 text-rose-700' : value === true ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-600')}>
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
