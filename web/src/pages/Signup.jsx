import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, UserPlus } from 'lucide-react';
import { api, setToken } from '../api.js';
import { Button, Card } from '../ui.jsx';

const MIN_PASSWORD = 12;

export default function Signup() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api('/public/config', { auth: false })
      .then((c) => alive && setConfig(c))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api('/auth/signup', { method: 'POST', auth: false, body: { name, email, password, company } });
      setToken(result.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const publicDemo = !!config?.public_demo;
  const requiresCompany = !!config?.signup?.requires_company;

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white"><ShieldCheck size={20} /></span>
            <span className="text-lg font-semibold tracking-tight">Vantage</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">
            Sign up with your name, email and a password of at least {MIN_PASSWORD} characters.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Display name</span>
              <input type="text" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            {requiresCompany && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-700">Company</span>
                <input type="text" name="company" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} required maxLength={160}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Email</span>
              <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Password</span>
              <input type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={MIN_PASSWORD} maxLength={1024}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">Create account <ArrowRight size={15} /></Button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500">
            Already have an account? <Link to="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
          </p>
          {publicDemo && (
            <Card className="mt-6 bg-slate-50 p-3 text-xs text-ink-500">
              <p className="font-medium text-ink-700">Shared demonstration</p>
              <p className="mt-1">
                This workspace is shared and periodically reset. Use fictional details here, or use the seeded demo accounts on the sign-in page.
              </p>
            </Card>
          )}
        </div>
      </div>

      <div className="hidden bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-md text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Self-service workspace</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">Start with a normal contributor account.</h2>
          <p className="mt-3 text-sm text-white/80">
            New accounts can explore dashboards, evidence workflows and remediation tasks without gaining administrative privileges.
          </p>
          <div className="mt-10 rounded-2xl border border-white/20 bg-white/10 p-5">
            <UserPlus size={22} />
            <p className="mt-3 text-sm font-semibold">Bounded public signup</p>
            <p className="mt-1 text-sm text-white/75">
              Signup is rate limited and validates every field before anything is written.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
