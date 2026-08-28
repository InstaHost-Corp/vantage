import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowUpRight, CalendarClock } from 'lucide-react';
import { post, useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Progress, formatDate, useToast } from '../ui.jsx';

export default function Frameworks() {
  const { data, loading, reload } = useApi('/frameworks');
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  if (loading || !data) return <Loading label="Loading frameworks" />;

  const toggle = async (f) => {
    setBusy(f.slug);
    try {
      const res = await post(`/frameworks/${f.slug}/toggle`);
      toast(`${f.name} ${res.enabled ? 'enabled' : 'disabled'}`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const enabled = data.filter((f) => f.enabled);
  const available = data.filter((f) => !f.enabled);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Frameworks"
        description="One control set, mapped to every framework you need. Enable a framework to start tracking readiness against its requirements."
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {enabled.map((f) => (
          <Card key={f.slug} className="flex flex-col p-5 transition hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: f.color }}>
                  {f.short_name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold leading-tight">{f.short_name}</p>
                  <p className="text-xs text-ink-500">{f.category}</p>
                </div>
              </div>
              <Pill status={f.audit_status} />
            </div>

            <p className="mt-3 line-clamp-3 text-sm text-ink-500">{f.description}</p>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-ink-500">Readiness</span>
                <span className="font-semibold tabular-nums">{f.readiness}%</span>
              </div>
              <Progress value={f.readiness} />
              <div className="mt-2 flex justify-between text-xs text-ink-500">
                <span>{f.controls_ok}/{f.controls_total} controls OK</span>
                <span>{f.requirements_at_risk} of {f.requirements_total} requirements at risk</span>
              </div>
            </div>

            {f.target_date && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                <CalendarClock size={13} /> Target audit date {formatDate(f.target_date)}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Link to={`/frameworks/${f.slug}`} className="flex-1">
                <Button variant="secondary" size="sm" className="w-full">Open <ArrowUpRight size={14} /></Button>
              </Link>
              <Button variant="ghost" size="sm" loading={busy === f.slug} onClick={() => toggle(f)}>Disable</Button>
            </div>
          </Card>
        ))}
      </div>

      {available.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-ink-500">Available frameworks</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {available.map((f) => (
              <Card key={f.slug} className="flex items-start justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white opacity-60" style={{ background: f.color }}>
                      {f.short_name.slice(0, 2).toUpperCase()}
                    </span>
                    <p className="font-semibold">{f.short_name}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-500">{f.description}</p>
                  <p className="mt-2 text-xs text-ink-500">{f.requirements_total} requirements · {f.controls_total} mapped controls</p>
                </div>
                <Button size="sm" loading={busy === f.slug} onClick={() => toggle(f)}>Enable</Button>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
