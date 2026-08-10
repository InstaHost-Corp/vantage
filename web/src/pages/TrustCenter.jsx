import { useState } from 'react';
import { BadgeCheck, CheckCircle2, ChevronDown, Clock3, FileText, Lock, MinusCircle, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../api.js';
import { Button, Card, Loading, Modal, cx, timeAgo } from '../ui.jsx';

export default function TrustCenter() {
  const { data, loading } = useApi('/public/trust');
  const [open, setOpen] = useState({});
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', company: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  if (loading || !data) return <Loading label="Loading Trust Center" />;
  const { company, trust, frameworks, control_groups: groups, documents, subprocessors, posture } = data;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/public/trust/request', { method: 'POST', auth: false, body: { ...form, document: request.name } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const controlIcon = (status) => {
    if (status === 'passing') return <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />;
    if (status === 'failing') return <Clock3 size={16} className="shrink-0 text-amber-500" />;
    return <MinusCircle size={16} className="shrink-0 text-slate-400" />;
  };

  return (
    <div className="min-h-full bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white"><ShieldCheck size={17} /></span>
            <span className="font-semibold tracking-tight">{company.name}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href={`mailto:${company.contact}`} className="text-ink-500 hover:text-ink-900">Contact security</a>
            <a href="/login"><Button size="sm" variant="secondary">Employee sign in</Button></a>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Monitored continuously · updated {timeAgo(data.updated_at)}
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink-900">{trust.headline}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-500">{trust.subhead}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            {frameworks.map((f) => (
              <div key={f.slug} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: f.color }}>
                  {f.short_name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{f.short_name}</p>
                  <p className="text-[11px] text-ink-500">
                    {f.audit_status === 'in_progress' ? 'Audit in progress' : f.audit_status === 'monitoring' ? 'Continuously monitored' : f.audit_status === 'ready' ? 'Audit ready' : 'Certified'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [`${posture.tests_passing}/${posture.tests_total}`, 'automated controls tests passing'],
              [`${groups.reduce((a, g) => a + g.items.length, 0)}`, 'documented controls in the programme'],
              [`${subprocessors.length}`, 'sub-processors disclosed publicly'],
            ].map(([value, label]) => (
              <Card key={label} className="p-5">
                <p className="text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-sm text-ink-500">{label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-xl font-semibold tracking-tight">Documents</h2>
        <p className="mt-1 text-sm text-ink-500">Public documents download instantly. Gated documents are released after a short access request.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {documents.map((d) => (
            <Card key={d.id} className="flex items-start justify-between gap-4 p-4">
              <div className="flex gap-3">
                <FileText size={18} className="mt-0.5 shrink-0 text-brand-500" />
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{d.description}</p>
                </div>
              </div>
              {d.gated ? (
                <Button size="sm" variant="secondary" onClick={() => { setRequest(d); setSent(false); }}><Lock size={13} /> Request</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => alert(`${d.name} would download here.`)}>Download</Button>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-semibold tracking-tight">Controls</h2>
          <p className="mt-1 text-sm text-ink-500">
            Each control below is owned, documented and — where it can be — tested automatically against our live systems.
          </p>
          <div className="mt-5 space-y-2">
            {groups.map((group) => {
              const isOpen = open[group.category];
              const passing = group.items.filter((i) => i.status === 'passing').length;
              return (
                <Card key={group.category} className="overflow-hidden">
                  <button onClick={() => setOpen((o) => ({ ...o, [group.category]: !o[group.category] }))}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50">
                    <span className="flex items-center gap-3">
                      <BadgeCheck size={17} className="text-brand-500" />
                      <span className="font-medium">{group.category}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-ink-500">
                      {passing}/{group.items.length} verified
                      <ChevronDown size={16} className={cx('transition-transform', isOpen && 'rotate-180')} />
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="animate-fade-up divide-y divide-slate-100 border-t border-slate-100">
                      {group.items.map((c) => (
                        <li key={c.code} className="flex items-start gap-3 px-5 py-3">
                          {controlIcon(c.status)}
                          <div>
                            <p className="text-sm font-medium text-ink-900">{c.name}</p>
                            <p className="mt-0.5 text-xs text-ink-500">{c.description}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-xl font-semibold tracking-tight">Sub-processors</h2>
        <p className="mt-1 text-sm text-ink-500">Third parties that may process customer data on our behalf.</p>
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr><th className="px-4 py-2.5">Sub-processor</th><th className="px-4 py-2.5">Purpose</th><th className="px-4 py-2.5">Data processed</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {subprocessors.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-ink-500">{s.description}</td>
                  <td className="px-4 py-3 text-ink-500">{s.data_processed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-ink-500">
          <p>{company.description}</p>
          <p>Powered by <span className="font-semibold text-brand-600">Vantage</span> · security questions? <a className="text-brand-600 hover:underline" href={`mailto:${company.contact}`}>{company.contact}</a></p>
        </div>
      </footer>

      <Modal open={!!request} onClose={() => setRequest(null)} title={sent ? 'Request received' : `Request ${request?.name}`}>
        {sent ? (
          <p className="text-sm text-ink-700">
            Thanks — our security team reviews requests within one business day. You will receive the document by email once approved.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-ink-500">This document is shared under NDA. Tell us who you are and we will send it over.</p>
            {['name', 'email', 'company'].map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">{field}</span>
                <input required type={field === 'email' ? 'email' : 'text'} value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>
            ))}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" className="w-full">Request access</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
