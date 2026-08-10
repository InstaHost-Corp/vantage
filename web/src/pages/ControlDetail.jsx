import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, FileCheck2, Paperclip } from 'lucide-react';
import { patch, useApi } from '../api.js';
import { Avatar, Button, Card, Loading, PageHeader, Pill, Select, StatusIcon, Table, Td, formatDate, useToast } from '../ui.jsx';

export default function ControlDetail() {
  const { code } = useParams();
  const { data, loading, reload } = useApi(`/controls/${code}`);
  const { data: users } = useApi('/users');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading control" />;

  const assign = async (ownerId) => {
    setSaving(true);
    try {
      await patch(`/controls/${code}`, { owner_id: Number(ownerId) });
      toast('Control owner updated');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const byFramework = data.requirements.reduce((acc, r) => {
    (acc[r.short_name] ||= { color: r.color, slug: r.slug, items: [] }).items.push(r);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={<Link to="/controls" className="mb-1 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">Controls <ChevronRight size={12} /> {data.code}</Link>}
        title={data.name}
        description={data.description}
        actions={<Pill status={data.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold">Automated tests</h2>
              <p className="text-xs text-ink-500">Evidence is collected automatically every hour</p>
            </div>
            {data.tests_detail.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">This control is evidenced manually. Attach documents below.</p>
            ) : (
              <Table head={['', 'Test', 'Integration', 'Entities', 'Last run']}>
                {data.tests_detail.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <Td className="w-8 pr-0"><StatusIcon status={t.status} /></Td>
                    <Td>
                      <Link to={`/monitoring/${t.slug}`} className="font-medium text-ink-900 hover:text-brand-600">{t.name}</Link>
                      <p className="mt-0.5 line-clamp-1 max-w-lg text-xs text-ink-500">{t.description}</p>
                    </Td>
                    <Td className="text-xs text-ink-500">{t.integration}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      <span className={t.failing_count ? 'text-rose-600' : 'text-emerald-600'}>{t.passing_count} passing</span>
                      {t.failing_count > 0 && <span className="text-rose-600"> · {t.failing_count} failing</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(t.last_run)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold">Evidence</h2>
              <Button variant="secondary" size="sm" onClick={() => toast('Evidence upload is available on connected storage in production')}>
                <Paperclip size={14} /> Attach evidence
              </Button>
            </div>
            {data.evidence.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">No manual evidence attached to this control.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.evidence.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FileCheck2 size={16} className="text-brand-500" />
                      <div>
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="text-xs text-ink-500">{e.source} · collected {formatDate(e.collected_at)}</p>
                      </div>
                    </div>
                    <span className="text-xs text-ink-500">Renews {formatDate(e.renewal_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Owner</p>
            <div className="mt-2 flex items-center gap-2.5">
              <Avatar name={data.owner?.name} />
              <div>
                <p className="text-sm font-medium">{data.owner?.name}</p>
                <p className="text-xs text-ink-500">{data.owner?.email}</p>
              </div>
            </div>
            {users && (
              <Select className="mt-3" value={String(data.owner_id || '')} onChange={assign}
                options={users.map((u) => ({ value: String(u.id), label: u.name }))} />
            )}
            {saving && <p className="mt-2 text-xs text-ink-500">Saving…</p>}
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Category</dt><dd className="font-medium">{data.category}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Tests</dt><dd className="font-medium">{data.tests}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Failing</dt><dd className="font-medium">{data.failing}</dd></div>
            </dl>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Framework mapping</p>
            <div className="mt-3 space-y-4">
              {Object.entries(byFramework).map(([name, group]) => (
                <div key={name}>
                  <Link to={`/frameworks/${group.slug}`} className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline">
                    <span className="h-2 w-2 rounded-full" style={{ background: group.color }} /> {name}
                  </Link>
                  <ul className="space-y-1">
                    {group.items.map((r) => (
                      <li key={`${name}-${r.code}`} className="text-xs text-ink-600">
                        <span className="font-mono text-ink-500">{r.code}</span> · {r.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
