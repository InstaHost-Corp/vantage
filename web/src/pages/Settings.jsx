import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { patch, post, setToken, useApi } from '../api.js';
import { Avatar, Button, Card, Loading, PageHeader, Pill, Table, Td, useToast } from '../ui.jsx';

export default function Settings() {
  const { data, loading } = useApi('/settings');
  const { data: users } = useApi('/users');
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading settings" />;

  const save = async (key, value) => {
    setBusy(key);
    try {
      await patch('/settings', { company: { [key]: value } });
      toast('Settings saved');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!confirm('Reset the workspace to its seeded demo state? All remediation you have performed will be undone.')) return;
    setBusy('reset');
    try {
      const res = await post('/demo/reset');
      if (res?.token) setToken(res.token);
      toast('Workspace reset');
      setTimeout(() => location.assign('/'), 600);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Workspace configuration, users and demo controls." />

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Company</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[['name', 'Company name'], ['domain', 'Primary domain'], ['contact', 'Security contact'], ['subdomain', 'Trust Center domain']].map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">{label}</span>
              <input defaultValue={data.company[key]} onBlur={(e) => save(key, e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">Description</span>
          <textarea defaultValue={data.company.description} rows={2} onBlur={(e) => save('description', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </label>
        {busy && busy !== 'reset' && <p className="mt-2 text-xs text-ink-500">Saving…</p>}
      </Card>

      <Card className="mt-5">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Workspace users</h2>
        </div>
        <Table head={['User', 'Email', 'Role']}>
          {(users || []).map((u) => (
            <tr key={u.id}>
              <Td>
                <span className="flex items-center gap-2.5">
                  <Avatar name={u.name} size="sm" />
                  <span>
                    <span className="block text-sm font-medium">{u.name}</span>
                    <span className="block text-xs text-ink-500">{u.title}</span>
                  </span>
                </span>
              </Td>
              <Td className="text-xs text-ink-500">{u.email}</Td>
              <Td><Pill status={u.role === 'admin' ? 'active' : 'open'} label={u.role} /></Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="mt-5 border-rose-200 p-5">
        <h2 className="text-sm font-semibold text-rose-700">Demo controls</h2>
        <p className="mt-1 text-sm text-ink-500">
          Reset the workspace to its seeded state. This restores the original failing tests so you can walk through remediation again.
        </p>
        <Button className="mt-4" variant="danger" loading={busy === 'reset'} onClick={reset}><RotateCcw size={15} /> Reset demo data</Button>
      </Card>
    </div>
  );
}
