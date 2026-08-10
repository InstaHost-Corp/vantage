import { useMemo, useState } from 'react';
import { Laptop } from 'lucide-react';
import { useApi } from '../api.js';
import { Avatar, Card, Loading, PageHeader, Pill, Progress, SearchInput, Table, Td, cx, timeAgo } from '../ui.jsx';

const CHECKS = [
  ['encrypted', 'Disk encryption'],
  ['screen_lock', 'Screen lock'],
  ['antivirus', 'Endpoint protection'],
  ['os_up_to_date', 'OS up to date'],
];

export default function Devices() {
  const { data, loading } = useApi('/devices');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => (data || []).filter((d) =>
    !q || `${d.name} ${d.owner} ${d.os} ${d.serial} ${d.mdm}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  if (loading || !data) return <Loading label="Loading devices" />;
  const compliant = data.filter((d) => CHECKS.every(([k]) => d[k])).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Devices"
        description="Endpoint posture reported by your MDM and the Vantage agent. Devices that fail a check create a remediation task against the endpoint controls."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-5">
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Compliant</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{compliant}/{data.length}</p>
          <Progress value={(compliant / Math.max(1, data.length)) * 100} className="mt-2" />
        </Card>
        {CHECKS.map(([key, label]) => {
          const ok = data.filter((d) => d[key]).length;
          return (
            <Card key={key} className="px-5 py-4">
              <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
              <p className={cx('mt-1 text-2xl font-semibold tabular-nums', ok < data.length && 'text-amber-600')}>{ok}/{data.length}</p>
            </Card>
          );
        })}
      </div>

      <SearchInput value={q} onChange={setQ} placeholder="Search devices…" className="mb-4 w-72" />

      <Card>
        <Table head={['Device', 'Owner', 'OS', 'MDM', 'Checks', 'Last check-in']}>
          {filtered.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50/70">
              <Td>
                <div className="flex items-center gap-2.5">
                  <Laptop size={16} className="text-brand-500" />
                  <div>
                    <p className="font-medium text-ink-900">{d.name}</p>
                    <p className="font-mono text-[11px] text-ink-500">{d.serial}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <span className="flex items-center gap-2 text-sm"><Avatar name={d.owner} size="sm" />{d.owner}</span>
                <p className="pl-8 text-xs text-ink-500">{d.department}</p>
              </Td>
              <Td className="text-xs text-ink-500">{d.os} {d.os_version}</Td>
              <Td className="text-xs text-ink-500">{d.mdm}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {CHECKS.map(([key, label]) => (
                    <span key={key} title={label}
                      className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', d[key] ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                      {label.split(' ')[0]}
                    </span>
                  ))}
                </div>
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{timeAgo(d.last_checkin)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
