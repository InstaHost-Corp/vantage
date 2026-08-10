import { useState } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, cx, timeAgo, useToast } from '../ui.jsx';

export default function Integrations() {
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi('/integrations', [version]);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading integrations" />;

  const act = async (integration, action, message) => {
    setBusy(`${integration.slug}-${action}`);
    try {
      await post(`/integrations/${integration.slug}/${action}`);
      toast(message);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const connected = data.filter((i) => i.status === 'connected');
  const available = data.filter((i) => i.status !== 'connected');
  const categories = [...new Set(available.map((i) => i.category))].sort();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Integrations"
        description="Connect the systems that hold your evidence. Vantage pulls configuration read-only and evaluates it against your control set every hour."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Connected</p><p className="mt-1 text-2xl font-semibold tabular-nums">{connected.length}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Resources monitored</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.reduce((a, i) => a + i.resource_count, 0)}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Tests powered</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.reduce((a, i) => a + i.test_count, 0)}</p></Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Connected</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {connected.map((i) => (
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
              <Pill status="connected" />
            </div>
            <p className="mt-3 text-sm text-ink-500">{i.description}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
              <span><strong className="text-ink-900">{i.resource_count}</strong> resources</span>
              <span><strong className="text-ink-900">{i.test_count}</strong> tests</span>
              <span>Synced {timeAgo(i.last_sync)}</span>
            </div>
            <p className="mt-2 truncate font-mono text-[11px] text-ink-500">{i.account}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" loading={busy === `${i.slug}-sync`} onClick={() => act(i, 'sync', `${i.name} synced`)}>
                <RefreshCw size={13} /> Sync now
              </Button>
              <Button variant="ghost" size="sm" loading={busy === `${i.slug}-disconnect`} onClick={() => act(i, 'disconnect', `${i.name} disconnected`)}>
                Disconnect
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-ink-500">Available</h2>
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
                <Button size="sm" loading={busy === `${i.slug}-connect`} onClick={() => act(i, 'connect', `${i.name} connected`)}>
                  <Plug size={13} /> Connect
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
