import { useState } from 'react';
import { ExternalLink, Lock, Unlock } from 'lucide-react';
import { patch, post, useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Table, Td, formatDate, timeAgo, useToast } from '../ui.jsx';

export default function TrustAdmin() {
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi('/trust', [version]);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading Trust Center" />;

  const act = async (fn, id, message) => {
    setBusy(id);
    try { await fn(); toast(message); setVersion((v) => v + 1); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Trust Center"
        description="Publish your security posture so prospects can self-serve. Documents can be public or gated behind an access request."
        actions={<a href="/trust" target="_blank" rel="noreferrer"><Button variant="secondary">View public page <ExternalLink size={14} /></Button></a>}
      />

      <div className="grid gap-5 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <h2 className="text-sm font-semibold">Page content</h2>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">Headline</span>
            <input defaultValue={data.settings.headline} onBlur={(e) => act(() => patch('/trust', { headline: e.target.value }), 'headline', 'Headline updated')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">Sub-headline</span>
            <textarea defaultValue={data.settings.subhead} rows={3}
              onBlur={(e) => act(() => patch('/trust', { subhead: e.target.value }), 'subhead', 'Sub-headline updated')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </label>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Publishing</h2>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-ink-500">Status</span>
            <Pill status={data.settings.published ? 'active' : 'draft'} label={data.settings.published ? 'Published' : 'Draft'} />
          </div>
          <p className="mt-3 break-all font-mono text-xs text-ink-500">{data.company.subdomain}</p>
          <Button className="mt-4 w-full" variant="secondary" size="sm" loading={busy === 'publish'}
            onClick={() => act(() => patch('/trust', { published: !data.settings.published }), 'publish', data.settings.published ? 'Trust Center unpublished' : 'Trust Center published')}>
            {data.settings.published ? 'Unpublish' : 'Publish'}
          </Button>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Documents</h2>
          <p className="text-xs text-ink-500">Gated documents require an approved access request before download</p>
        </div>
        <Table head={['Document', 'Type', 'Access', 'Updated', '']}>
          {data.documents.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50/70">
              <Td>
                <p className="font-medium text-ink-900">{d.name}</p>
                <p className="max-w-lg text-xs text-ink-500">{d.description}</p>
              </Td>
              <Td className="text-xs capitalize text-ink-500">{d.type}</Td>
              <Td>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {d.gated ? <><Lock size={13} className="text-amber-600" /> Gated (NDA)</> : <><Unlock size={13} className="text-emerald-600" /> Public</>}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(d.updated_at)}</Td>
              <Td className="text-right">
                <Button size="sm" variant="ghost" loading={busy === d.id}
                  onClick={() => act(() => patch(`/trust/documents/${d.id}`, { gated: !d.gated }), d.id, `${d.name} is now ${d.gated ? 'public' : 'gated'}`)}>
                  {d.gated ? 'Make public' : 'Gate'}
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="mt-5">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Access requests</h2>
        </div>
        <Table head={['Requester', 'Company', 'Document', 'Status', 'Received', '']}>
          {data.requests.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70">
              <Td>
                <p className="font-medium text-ink-900">{r.name}</p>
                <p className="text-xs text-ink-500">{r.email}</p>
              </Td>
              <Td className="text-xs text-ink-500">{r.company}</Td>
              <Td className="text-xs text-ink-500">{r.document}</Td>
              <Td><Pill status={r.status} /></Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{timeAgo(r.created_at)}</Td>
              <Td className="text-right">
                {r.status === 'pending' && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" loading={busy === r.id} onClick={() => act(() => post(`/trust/requests/${r.id}/approve`), r.id, `Access approved for ${r.company}`)}>Approve</Button>
                    <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => act(() => post(`/trust/requests/${r.id}/deny`), r.id, 'Request denied')}>Deny</Button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        {data.requests.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">No access requests yet.</p>}
      </Card>
    </div>
  );
}
