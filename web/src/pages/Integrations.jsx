import { useState } from 'react';
import { Plug } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Button, Card, Drawer, Loading, PageHeader, Pill, useToast } from '../ui.jsx';

export default function Integrations({ user }) {
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi('/integrations', [version]);
  const [busy, setBusy] = useState(null);
  const [configuring, setConfiguring] = useState(null);
  const [account, setAccount] = useState('');
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  if (loading || !data) return <Loading label="Loading integrations" />;

  const act = async (integration, action, message, body) => {
    setBusy(`${integration.slug}-${action}`);
    try {
      await post(`/integrations/${integration.slug}/${action}`, body);
      toast(message);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const configured = data.filter((i) => i.status === 'configured');
  const available = data.filter((i) => i.status !== 'configured');
  const categories = [...new Set(available.map((i) => i.category))].sort();
  const openConfiguration = (integration) => {
    setAccount(integration.account || '');
    setConfiguring(integration);
  };
  const saveConfiguration = async (event) => {
    event.preventDefault();
    if (!configuring) return;
    await act(configuring, 'connect', `${configuring.name} configured`, { account });
    setConfiguring(null);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Integrations"
        description="Record the services used by this workspace and the account they belong to."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Configured</p><p className="mt-1 text-2xl font-semibold tabular-nums">{configured.length}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Workspace resource records</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.reduce((a, i) => a + i.resource_count, 0)}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Tests powered</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.reduce((a, i) => a + i.test_count, 0)}</p></Card>
      </div>

      <Card className="mb-8 border-brand-100 bg-brand-50/40 p-4 text-sm text-ink-600">
        <p className="font-medium text-ink-900">Configuration only</p>
        <p className="mt-1">Vantage does not collect data or store API keys for configured services. Add an account reference to document your workspace; a provider-specific, read-only authorization flow is required before automated collection is available.</p>
      </Card>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Configured services</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {configured.map((i) => (
          <Card key={i.slug} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
                  {i.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold leading-tight">{i.name}</p>
                  <p className="text-xs text-ink-500">{i.category}</p>
                </div>
              </div>
              <Pill status="configured" />
            </div>
            <p className="mt-3 text-sm text-ink-500">{i.description}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
              <span><strong className="text-ink-900">{i.resource_count}</strong> resources</span>
              <span><strong className="text-ink-900">{i.test_count}</strong> tests</span>
              <span>No automated collection</span>
            </div>
            {isAdmin && <p className="mt-2 truncate font-mono text-[11px] text-ink-500">Account reference: {i.account}</p>}
            {isAdmin && <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => openConfiguration(i)}>Edit reference</Button>
              <Button variant="ghost" size="sm" loading={busy === `${i.slug}-disconnect`} onClick={() => act(i, 'disconnect', `${i.name} reference removed`)}>Remove</Button>
            </div>}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-ink-500">Available services</h2>
      {categories.map((category) => (
        <div key={category} className="mb-6">
          <p className="mb-2 text-xs font-medium text-ink-500">{category}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {available.filter((i) => i.category === category).map((i) => (
              <Card key={i.slug} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="line-clamp-2 text-xs text-ink-500">{i.description}</p>
                </div>
                {isAdmin && <Button size="sm" onClick={() => openConfiguration(i)}><Plug size={13} /> Configure</Button>}
              </Card>
            ))}
          </div>
        </div>
      ))}

      {isAdmin && <Drawer open={!!configuring} onClose={() => setConfiguring(null)} title={`Configure ${configuring?.name || ''}`} subtitle="Workspace service reference">
        <form onSubmit={saveConfiguration} className="space-y-5">
          <p className="text-sm text-ink-600">Enter a non-secret account, tenant, or organisation reference. Do not enter an API key, password, access token, callback URL, or other credential.</p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Account reference</span>
            <input value={account} onChange={(event) => setAccount(event.target.value)} required minLength={2} maxLength={80} autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfiguring(null)}>Cancel</Button>
            <Button type="submit" loading={busy === `${configuring?.slug}-connect`}>Save configuration</Button>
          </div>
        </form>
      </Drawer>}
    </div>
  );
}
