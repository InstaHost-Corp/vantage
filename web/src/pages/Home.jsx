import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Boxes, Building2, ClipboardCheck, Copy, Github, Globe,
  LayoutGrid, Lock, MessageSquareText, Plug, ScrollText, ShieldCheck,
  TriangleAlert, Users,
} from 'lucide-react';
import { api } from '../api.js';
import { Button } from '../ui.jsx';

const FEATURES = [
  { icon: LayoutGrid, title: 'Framework baselines', body: 'Seven educational framework baselines (ISO 27001, SOC 2, NIST CSF and more) mapped to one shared control set.' },
  { icon: ShieldCheck, title: 'Owned controls', body: 'Controls linked to requirements and the tests that validate them, so gaps are visible at a glance.' },
  { icon: Activity, title: 'Monitoring', body: 'Data-driven tests over resource, device, personnel, policy, vendor and risk records.' },
  { icon: ScrollText, title: 'Policies', body: 'Versioned policy records with review and acceptance workflows.' },
  { icon: Users, title: 'Personnel & devices', body: 'Roster, training and endpoint posture records in one place.' },
  { icon: Building2, title: 'Vendors & risk', body: 'Third-party inventory, risk scoring and treatment tracking.' },
  { icon: ClipboardCheck, title: 'Audit preparation', body: 'Evidence requests, supporting evidence and assurance-engagement workflows.' },
  { icon: MessageSquareText, title: 'Questionnaires', body: 'Draft answers sourced from your own controls and policies, flagged for human review.' },
  { icon: Globe, title: 'Trust Center', body: 'A shareable security profile generated from your own monitoring data.' },
  { icon: Plug, title: 'Workspace integrations', body: 'Tenant-scoped service references you manage yourself \u2014 no external API calls or credential storage.' },
  { icon: Boxes, title: 'Asset inventory', body: 'Track the resources your controls and tests actually cover.' },
  { icon: TriangleAlert, title: 'Risk register', body: 'Log, score and track remediation for identified risks end to end.' },
];

export default function Home() {
  const [config, setConfig] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api('/public/config', { auth: false }).then((c) => alive && setConfig(c)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sourceUrl = config?.source_url || 'https://github.com/phamid/vantage';
  const setupCommand = `git clone ${sourceUrl}.git\ncd vantage\nnpm run setup\nnpm start`;

  const copySetup = async () => {
    try {
      await navigator.clipboard.writeText(setupCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable; the command is still visible to copy by hand */ }
  };

  return (
    <div className="min-h-full bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <ShieldCheck size={18} />
            </span>
            <span className="text-base font-semibold tracking-tight">Vantage</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-600 sm:flex">
            <a href="#features" className="hover:text-ink-900">What you can do</a>
            <a href="#open-source" className="hover:text-ink-900">Open source</a>
            <a href="/trust" className="hover:text-ink-900">Trust Center demo</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-slate-100">Sign in</Link>
            <Link to="/signup">
              <Button size="sm">Get started <ArrowRight size={14} /></Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Github size={13} /> Free and open source
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Know your compliance readiness before an audit does.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
            Vantage baselines your posture against common frameworks like ISO 27001, SOC 2, NIST CSF, PCI DSS and
            HIPAA, tracks controls and evidence, and prepares your team for formal audits and assurance engagements
            &mdash; all in your own isolated workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup"><Button size="lg">Create your workspace <ArrowRight size={15} /></Button></Link>
            <Link to="/login"><Button size="lg" variant="secondary">Sign in</Button></Link>
          </div>
          <p className="mt-4 text-xs text-ink-500">
            Every signup gets its own private, isolated workspace. No credit card, no sales call.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Everything you need to baseline readiness</h2>
          <p className="mt-3 text-sm text-ink-600 sm:text-base">
            One shared control set, mapped to the frameworks you care about, with the workflows to close the gaps.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon size={18} />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink-900">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Multi-tenant callout */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center sm:py-16">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900 text-white"><Lock size={20} /></span>
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-ink-900">Your workspace, fully isolated</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-600 sm:text-base">
            Vantage is multi-tenant by design: signing up creates a new company workspace with its own frameworks,
            controls, tests, personnel, policies and evidence, isolated from every other tenant. Connect your own
            services in your workspace as tenant-scoped references &mdash; Vantage never calls out to a provider or
            stores a credential on your behalf.
          </p>
        </div>
      </section>

      {/* Open source */}
      <section id="open-source" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-ink-600">
              MIT licensed
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Want a copy of your own?</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">
              Vantage is free and open source. Read every line of the platform, self-host it on your own
              infrastructure for full data control, or fork it to build on top of. No paid tier, no proprietary
              add-ons hidden behind a license key.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-600">
              <li className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-500" /> No runtime dependencies on the server &mdash; Node 24+, React and SQLite.</li>
              <li className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-500" /> Same multi-tenant production mode that powers this hosted instance.</li>
              <li className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-500" /> Fully documented in the repository &mdash; README, security policy and contribution guide included.</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                <Button variant="dark"><Github size={15} /> View source on GitHub</Button>
              </a>
              <a href={`${sourceUrl}#readme`} target="_blank" rel="noreferrer">
                <Button variant="secondary">Read the docs</Button>
              </a>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-ink-900 p-5 text-sm text-slate-100 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Run it yourself</span>
              <button onClick={copySetup} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-white/10">
                <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-emerald-300">{setupCommand}</pre>
            <p className="mt-3 text-xs text-slate-400">
              Opens at <code className="rounded bg-white/10 px-1 py-0.5">http://localhost:4173</code>. The SQLite
              database is created and seeded automatically on first boot.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-6 py-16 text-center text-white sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Start baselining your readiness today</h2>
          <p className="max-w-xl text-sm text-white/85 sm:text-base">
            Create a free workspace in seconds, or browse a live example Trust Center built from monitoring data.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup"><Button size="lg" variant="dark">Create your workspace <ArrowRight size={15} /></Button></Link>
            <a href="/trust"><Button size="lg" variant="secondary">View demonstration Trust Center</Button></a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-8 text-center text-xs text-ink-500 sm:flex-row sm:justify-between sm:text-left">
          <p>
            &copy; {new Date().getFullYear()} Patrick Hamid. Vantage is an independent personal project, MIT licensed,
            and is not endorsed by, sponsored by, affiliated with, or supported by Microsoft.
          </p>
          <div className="flex items-center gap-4">
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ink-700 hover:underline"><Github size={13} /> GitHub</a>
            <Link to="/login" className="font-medium text-ink-700 hover:underline">Sign in</Link>
            <Link to="/signup" className="font-medium text-ink-700 hover:underline">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
