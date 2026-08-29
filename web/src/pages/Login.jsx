import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Github, ShieldCheck } from 'lucide-react';
import { api, post, setToken } from '../api.js';
import { Button, Card, cx } from '../ui.jsx';

// "every 24 hours" reads worse than "daily", and the cadence is configurable,
// so say whatever is actually true of this deployment.
function resetPhrase(minutes) {
  if (!minutes) return '';
  if (minutes === 1440) return ' and is restored to the seeded baseline daily';
  if (minutes % 1440 === 0) return ` and is restored to the seeded baseline every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return ` and is restored to the seeded baseline every ${minutes / 60} hours`;
  return ` and is restored to the seeded baseline every ${minutes} minutes`;
}

const HIGHLIGHTS = [
  ['49 simulated tests', 'Evaluate fictional cloud, identity, endpoint and people records against example controls.'],
  ['7 framework baselines', 'Explore how public framework structures can map to a shared control set.'],
  ['Evidence workflow', 'Organise fictional evidence and questionnaire drafts for human review.'],
];

export default function Login() {
  const [email, setEmail] = useState('ada@northwind.io');
  const [password, setPassword] = useState('vantage123');
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
      const { token } = await post('/auth/login', { email, password });
      setToken(token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const demo = config?.demo;
  const publicDemo = !!config?.public_demo;
  const sourceUrl = config?.source_url || 'https://github.com/phamid/vantage';

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white"><ShieldCheck size={20} /></span>
            <span className="text-lg font-semibold tracking-tight">Vantage</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-1 text-sm text-ink-500">
            {publicDemo
              ? 'A shared fictional compliance-readiness sandbox. Use an authorized demonstration account below.'
              : 'Explore compliance-readiness workflows with fictional data.'}
          </p>

          {/* autoComplete is off throughout: this is a shared demonstration with a
              published password, so the browser must not offer to save credentials
              against this origin, and must not autofill a visitor's real ones into
              it either. Both fields are pre-filled so nobody needs to type. */}
          <form onSubmit={submit} className="mt-8 space-y-4"
                autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Work email</span>
              <input type="email" name="vantage-demo-account" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore
                value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700">Password</span>
              <input type="password" name="vantage-demo-passphrase" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore
                value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">Sign in <ArrowRight size={15} /></Button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-500">
            Need your own account? <Link to="/signup" className="font-medium text-brand-600 hover:underline">Sign up</Link>
          </p>

          <Card className="mt-6 bg-slate-50 p-3 text-xs text-ink-500">
            <p className="font-medium text-ink-700">{publicDemo ? 'Free shared demonstration' : 'Demonstration environment'}</p>
            <p className="mt-1">
              This workspace contains fictional data. Sign in as
              <code className="mx-1 rounded bg-white px-1">ada@northwind.io</code> (admin),
              <code className="mx-1 rounded bg-white px-1">marcus@northwind.io</code> (security lead) or
              <code className="mx-1 rounded bg-white px-1">auditor@keeling-cpa.com</code> (external auditor).
            </p>
            <p className="mt-1">
              The shared demonstration password is <code className="rounded bg-white px-1">{demo?.password || 'vantage123'}</code>.
            </p>
            {publicDemo && (
              <>
                <p className="mt-1">
                  Everyone shares this workspace, so anything you change is visible to other visitors
                  {demo?.auto_reset ? `${resetPhrase(demo.reset_interval_minutes)}` : ''}.
                  Run it on your own machine for a private copy.
                </p>
                <p className="mt-1">
                  Both fields are filled in already — nothing you type here is stored, and the page asks your browser
                  not to save or autofill credentials for it.
                </p>
                {demo?.accounts?.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-ink-500">Sign in as</span>
                    {demo.accounts.map((a) => (
                      <button key={a.email} type="button" onClick={() => setEmail(a.email)}
                        className={cx('rounded border px-1.5 py-0.5 font-medium transition-colors',
                          email === a.email ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-ink-700 hover:bg-slate-100')}>
                        {a.name.split(' ')[0]} <span className="text-ink-500">({a.role})</span>
                      </button>
                    ))}
                  </p>
                )}
              </>
            )}
          </Card>
          <p className="mt-4 text-center text-xs text-ink-500">
            Looking for the fictional security profile? <a href="/trust" className="font-medium text-brand-600 hover:underline">Visit the demonstration Trust Center</a>
          </p>
          <p className="mt-2 text-center text-xs text-ink-500">
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              <Github size={13} /> Free and open source on GitHub
            </a>
          </p>
        </div>
      </div>

      <div className="hidden bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-md text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Fictional readiness sandbox</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">Explore control baselining without connecting real systems.</h2>
          <p className="mt-3 text-sm text-white/80">
            Vantage evaluates seeded demonstration records and shows how tests, controls, evidence drafts,
            questionnaire drafts and a Trust Center can fit together.
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
