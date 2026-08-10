import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { post, setToken } from '../api.js';
import { Button, Card } from '../ui.jsx';

const HIGHLIGHTS = [
  ['49 automated tests', 'Continuously evaluate cloud, identity, endpoint and people data against your controls.'],
  ['7 frameworks', 'SOC 2, ISO 27001, HIPAA, GDPR, PCI DSS, NIST CSF and ISO 42001 mapped to one control set.'],
  ['Audit-ready evidence', 'Collect evidence automatically and share it with your auditor in one workspace.'],
];

export default function Login() {
  const [email, setEmail] = useState('ada@northwind.io');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await post('/auth/login', { email, password });
      setToken(token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white"><ShieldCheck size={20} /></span>
            <span className="text-lg font-semibold tracking-tight">Vantage</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-1 text-sm text-ink-500">Automate compliance and prove trust continuously.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Work email</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">Sign in <ArrowRight size={15} /></Button>
          </form>

          <Card className="mt-6 bg-slate-50 p-3 text-xs text-ink-500">
            <p className="font-medium text-ink-700">Demonstration environment</p>
            <p className="mt-1">
              This workspace contains fictional data. Sign in as
              <code className="mx-1 rounded bg-white px-1">ada@northwind.io</code> (admin),
              <code className="mx-1 rounded bg-white px-1">marcus@northwind.io</code> (security lead) or
              <code className="mx-1 rounded bg-white px-1">auditor@keeling-cpa.com</code> (external auditor).
            </p>
            <p className="mt-1">The shared demonstration password is <code className="rounded bg-white px-1">vantage123</code>.</p>
          </Card>
          <p className="mt-4 text-center text-xs text-ink-500">
            Looking for our public security posture? <a href="/trust" className="font-medium text-brand-600 hover:underline">Visit the Trust Center</a>
          </p>
        </div>
      </div>

      <div className="hidden bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-md text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Trust management platform</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">Compliance that proves itself, every hour.</h2>
          <p className="mt-3 text-sm text-white/80">
            Vantage connects to the systems you already use, tests your controls continuously and turns the results into
            audit evidence, questionnaire answers and a public Trust Center.
          </p>
          <div className="mt-10 space-y-5">
            {HIGHLIGHTS.map(([title, body]) => (
              <div key={title} className="border-l-2 border-white/30 pl-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-sm text-white/75">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
