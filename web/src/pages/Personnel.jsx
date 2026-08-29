import { useMemo, useState } from 'react';
import { GraduationCap, ShieldOff, UserCheck } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Avatar, Button, Card, Drawer, Loading, PageHeader, Pill, Progress, SearchInput, Select, Table, Td, cx, formatDate, useToast } from '../ui.jsx';

export default function Personnel() {
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi('/personnel', [version]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  const filtered = useMemo(() => (data || []).filter((p) => {
    if (status && p.status !== status) return false;
    if (q && !`${p.name} ${p.email} ${p.title} ${p.department}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data, q, status]);

  if (loading || !data) return <Loading label="Loading personnel" />;

  const active = data.filter((p) => p.status === 'active');
  const trained = active.filter((p) => p.security_training === 'complete').length;
  const accepted = active.filter((p) => p.policies_accepted >= p.policies_expected).length;

  const act = async (person, action, message) => {
    setBusy(`${person.id}-${action}`);
    try {
      await post(`/personnel/${person.id}/${action}`);
      toast(message);
      setVersion((v) => v + 1);
      setSelected(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Personnel"
        description="Workspace personnel records for onboarding, security training, policy acceptance and offboarding."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Active personnel</p><p className="mt-1 text-2xl font-semibold tabular-nums">{active.length}</p></Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Training complete</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{trained}/{active.length}</p>
          <Progress value={(trained / Math.max(1, active.length)) * 100} className="mt-2" />
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Policies accepted</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{accepted}/{active.length}</p>
          <Progress value={(accepted / Math.max(1, active.length)) * 100} className="mt-2" />
        </Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Offboarded</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.filter((p) => p.status === 'offboarded').length}</p></Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search people…" className="w-72" />
        <Select value={status} onChange={setStatus} className="w-44"
          options={[{ value: 'active', label: 'Active' }, { value: 'offboarded', label: 'Offboarded' }, { value: '', label: 'Everyone' }]} />
      </div>

      <Card>
        <Table head={['Person', 'Department', 'Training', 'Background check', 'Policies', 'Devices', 'Start date']}>
          {filtered.map((p) => (
            <tr key={p.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setSelected(p)}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div>
                    <p className="font-medium text-ink-900">{p.name}</p>
                    <p className="text-xs text-ink-500">{p.title}</p>
                  </div>
                </div>
              </Td>
              <Td className="text-xs text-ink-500">{p.department} · {p.employment_type}</Td>
              <Td><Pill status={p.security_training === 'complete' ? 'complete' : p.security_training} /></Td>
              <Td><Pill status={p.background_check} /></Td>
              <Td className={cx('text-xs tabular-nums', p.policies_accepted >= p.policies_expected ? 'text-emerald-600' : 'text-amber-600')}>
                {p.policies_accepted}/{p.policies_expected}
              </Td>
              <Td className="text-xs text-ink-500">{p.device_count}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">
                {formatDate(p.start_date)}
                {p.status === 'offboarded' && <span className="block text-rose-600">ended {formatDate(p.end_date)}</span>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <PersonDrawer person={selected} onClose={() => setSelected(null)} onAct={act} busy={busy} />
    </div>
  );
}

function PersonDrawer({ person, onClose, onAct, busy }) {
  const { data } = useApi(person ? `/personnel/${person.id}` : '/me', [person?.id]);
  if (!person) return null;
  const detail = data?.id === person.id ? data : null;

  return (
    <Drawer open={!!person} onClose={onClose} title={person.name} subtitle={`${person.title} · ${person.department}`}>
      <div className="flex flex-wrap gap-2">
        {person.security_training !== 'complete' && (
          <Button size="sm" loading={busy === `${person.id}-complete_training`}
            onClick={() => onAct(person, 'complete_training', `Training recorded for ${person.name}`)}>
            <GraduationCap size={14} /> Record training
          </Button>
        )}
        {person.background_check !== 'complete' && person.background_check !== 'not_applicable' && (
          <Button size="sm" variant="secondary" loading={busy === `${person.id}-complete_background_check`}
            onClick={() => onAct(person, 'complete_background_check', `Background check recorded for ${person.name}`)}>
            <UserCheck size={14} /> Record background check
          </Button>
        )}
        {person.policies_accepted < person.policies_expected && (
          <Button size="sm" variant="secondary" loading={busy === `${person.id}-accept_policies`}
            onClick={() => onAct(person, 'accept_policies', `Policy acceptance recorded for ${person.name}`)}>
            Record policy acceptance
          </Button>
        )}
        {person.status === 'offboarded' && !person.offboarded_access_removed && (
          <Button size="sm" variant="danger" loading={busy === `${person.id}-revoke_access`}
            onClick={() => onAct(person, 'revoke_access', `Access revocation confirmed for ${person.name}`)}>
            <ShieldOff size={14} /> Confirm access revoked
          </Button>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        {[
          ['Email', person.email], ['Employment', person.employment_type], ['Status', person.status],
          ['Start date', formatDate(person.start_date)], ['Training due', formatDate(person.training_due)],
          ['Background check', person.background_check],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{value || '—'}</dd>
          </div>
        ))}
      </dl>

      {detail && (
        <>
          <h3 className="mt-8 mb-2 text-sm font-semibold">Devices</h3>
          {detail.devices.length === 0 ? <p className="text-sm text-ink-500">No managed devices.</p> : (
            <div className="space-y-2">
              {detail.devices.map((d) => (
                <Card key={d.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-ink-500">{d.os} {d.os_version} · {d.mdm} · {d.serial}</p>
                  </div>
                  <div className="flex gap-1">
                    {[['Enc', d.encrypted], ['Lock', d.screen_lock], ['AV', d.antivirus], ['Patch', d.os_up_to_date]].map(([label, ok]) => (
                      <span key={label} className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{label}</span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          <h3 className="mt-8 mb-2 text-sm font-semibold">Outstanding policies ({detail.outstanding.length})</h3>
          {detail.outstanding.length === 0 ? <p className="text-sm text-ink-500">All policies accepted.</p> : (
            <ul className="space-y-1 text-sm text-ink-700">
              {detail.outstanding.map((p) => <li key={p.slug}>· {p.name}</li>)}
            </ul>
          )}
        </>
      )}
    </Drawer>
  );
}
