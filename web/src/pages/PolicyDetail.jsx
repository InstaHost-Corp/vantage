import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BellRing, CheckCircle2, ChevronRight, Download } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Avatar, Button, Card, Loading, Markdown, PageHeader, Pill, Progress, Tabs, formatDate, timeAgo, useToast } from '../ui.jsx';

export default function PolicyDetail() {
  const { slug } = useParams();
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi(`/policies/${slug}`, [version]);
  const [tab, setTab] = useState('document');
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading policy" />;
  const total = data.acceptances.length + data.outstanding.length;
  const pct = total ? Math.round((data.acceptances.length / total) * 100) : 0;

  const act = async (id, fn) => {
    setBusy(id);
    try { await fn(); setVersion((v) => v + 1); } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([data.body], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-v${data.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={<Link to="/policies" className="mb-1 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">Policies <ChevronRight size={12} /> {data.category}</Link>}
        title={data.name}
        description={data.description}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={download}><Download size={15} /> Download</Button>
            <Button variant="secondary" loading={busy === 'remind'} onClick={() => act('remind', async () => {
              const res = await post(`/policies/${slug}/remind`);
              toast(`Reminders sent to ${res.reminded} people`);
            })}><BellRing size={15} /> Remind</Button>
            {data.status !== 'approved' && (
              <Button loading={busy === 'approve'} onClick={() => act('approve', async () => {
                await post(`/policies/${slug}/approve`);
                toast('Policy approved and published');
              })}><CheckCircle2 size={15} /> Approve &amp; publish</Button>
            )}
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Status</p><div className="mt-1.5"><Pill status={data.status} /></div></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Version</p><p className="mt-1 text-xl font-semibold">v{data.version}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Approved</p><p className="mt-1 text-sm font-medium">{formatDate(data.approved_at)}</p><p className="text-xs text-ink-500">Owner {data.owner}</p></Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Acceptance</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{pct}%</p>
          <Progress value={pct} className="mt-1.5" />
        </Card>
      </div>

      <Tabs className="mb-4" active={tab} onChange={setTab} tabs={[
        { value: 'document', label: 'Document' },
        { value: 'accepted', label: 'Accepted', count: data.acceptances.length },
        { value: 'outstanding', label: 'Outstanding', count: data.outstanding.length },
      ]} />

      {tab === 'document' && (
        <Card className="p-8">
          <Markdown text={data.body} />
        </Card>
      )}

      {tab === 'accepted' && (
        <Card className="divide-y divide-slate-100">
          {data.acceptances.map((a) => (
            <div key={a.name} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={a.name} size="sm" />
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-ink-500">{a.title}</p>
                </div>
              </div>
              <span className="text-xs text-ink-500">Accepted {timeAgo(a.accepted_at)}</span>
            </div>
          ))}
          {data.acceptances.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">Nobody has accepted this policy yet.</p>}
        </Card>
      )}

      {tab === 'outstanding' && (
        <Card className="divide-y divide-slate-100">
          {data.outstanding.map((p) => (
            <div key={p.email} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} size="sm" />
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-ink-500">{p.title} · {p.email}</p>
                </div>
              </div>
              <Pill status="pending" label="Awaiting acceptance" />
            </div>
          ))}
          {data.outstanding.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">Everyone has accepted this policy.</p>}
        </Card>
      )}
    </div>
  );
}
