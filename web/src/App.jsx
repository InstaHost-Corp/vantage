import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Boxes, Building2, ClipboardCheck, FileText, Gauge, Github, Globe, LayoutGrid, LogOut, Menu,
  MessageSquareText, Monitor, Plug, RefreshCw, ScrollText, Settings as SettingsIcon, ShieldCheck,
  TriangleAlert, Users, X,
} from 'lucide-react';
import { getToken, setToken, get, post } from './api.js';
import { Avatar, Button, Loading, cx, timeAgo, useToast } from './ui.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Frameworks from './pages/Frameworks.jsx';
import FrameworkDetail from './pages/FrameworkDetail.jsx';
import Controls from './pages/Controls.jsx';
import ControlDetail from './pages/ControlDetail.jsx';
import Monitoring from './pages/Monitoring.jsx';
import TestDetail from './pages/TestDetail.jsx';
import Policies from './pages/Policies.jsx';
import PolicyDetail from './pages/PolicyDetail.jsx';
import Personnel from './pages/Personnel.jsx';
import Devices from './pages/Devices.jsx';
import Vendors from './pages/Vendors.jsx';
import Risks from './pages/Risks.jsx';
import Integrations from './pages/Integrations.jsx';
import Inventory from './pages/Inventory.jsx';
import Audits from './pages/Audits.jsx';
import AuditDetail from './pages/AuditDetail.jsx';
import Questionnaires from './pages/Questionnaires.jsx';
import QuestionnaireDetail from './pages/QuestionnaireDetail.jsx';
import TrustAdmin from './pages/TrustAdmin.jsx';
import TrustCenter from './pages/TrustCenter.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: Gauge, end: true }] },
  {
    group: 'Compliance',
    items: [
      { to: '/frameworks', label: 'Frameworks', icon: LayoutGrid },
      { to: '/controls', label: 'Controls', icon: ShieldCheck },
      { to: '/monitoring', label: 'Monitoring', icon: Activity },
      { to: '/policies', label: 'Policies', icon: ScrollText },
      { to: '/audits', label: 'Audit hub', icon: ClipboardCheck },
    ],
  },
  {
    group: 'Risk',
    items: [
      { to: '/risks', label: 'Risk register', icon: TriangleAlert },
      { to: '/vendors', label: 'Vendors', icon: Building2 },
    ],
  },
  {
    group: 'People & assets',
    items: [
      { to: '/personnel', label: 'Personnel', icon: Users },
      { to: '/devices', label: 'Devices', icon: Monitor },
      { to: '/integrations', label: 'Integrations', icon: Plug },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    group: 'Trust',
    items: [
      { to: '/trust-center', label: 'Trust Center', icon: Globe },
      { to: '/questionnaires', label: 'Questionnaires', icon: MessageSquareText },
    ],
  },
];

function Sidebar({ user, company, onSignOut, open, onClose }) {
  return (
    <aside className={cx(
      'fixed inset-y-0 left-0 z-50 flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0',
      open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
    )}>
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <ShieldCheck size={18} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold tracking-tight">Vantage</p>
          <p className="truncate text-[11px] text-ink-500">{company?.name}</p>
        </div>
        <button onClick={onClose} aria-label="Close navigation" className="rounded-lg p-1 text-ink-500 hover:bg-slate-100 lg:hidden">
          <X size={17} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((section) => (
          <div key={section.group} className="mb-4">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.group}</p>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => cx('mb-0.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-slate-50')}>
                <item.icon size={16} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <NavLink to="/settings" className={({ isActive }) => cx('mb-1 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-slate-50')}>
          <SettingsIcon size={16} /> Settings
        </NavLink>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar name={user?.name} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium">{user?.name}</p>
            <p className="truncate text-[11px] text-ink-500">{user?.title}</p>
          </div>
          <button onClick={onSignOut} title="Sign out" className="rounded p-1 text-ink-500 hover:bg-slate-100"><LogOut size={14} /></button>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ lastRun, onScan, scanning, onOpenNav }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-2 text-xs text-ink-500">
        <button onClick={onOpenNav} aria-label="Open navigation" className="-ml-1 rounded-lg p-1.5 text-ink-700 hover:bg-slate-100 lg:hidden">
          <Menu size={18} />
        </button>
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="truncate"><span className="hidden sm:inline">Continuous monitoring active · </span>last scan {timeAgo(lastRun)}</span>
      </div>
      <div className="flex items-center gap-2">
        <a href="/trust" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-slate-50 sm:inline-flex">
          <Globe size={14} /> View Trust Center
        </a>
        <Button size="sm" onClick={onScan} loading={scanning}>
          {!scanning && <RefreshCw size={14} />} <span className="hidden sm:inline">Run all tests</span><span className="sm:hidden">Scan</span>
        </Button>
      </div>
    </header>
  );
}

function DemoBanner({ nextResetAt, sourceUrl }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-brand-200 bg-brand-50 px-4 py-1.5 text-center text-[11px] text-brand-800">
      <span className="font-semibold">Free public demo.</span>
      <span>
        Everything you change is shared with every other visitor
        {nextResetAt ? <> and resets {timeAgo(nextResetAt)}</> : null}.
      </span>
      <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
        <Github size={12} /> Source on GitHub
      </a>
    </div>
  );
}

function Shell() {
  const [me, setMe] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [version, setVersion] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  useEffect(() => {
    get('/me').then(setMe).catch(() => navigate('/login'));
  }, [navigate]);

  useEffect(() => {
    get('/dashboard').then((d) => setLastRun(d.last_run)).catch(() => {});
  }, [version, location.pathname]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const signOut = async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    setToken(null);
    navigate('/login');
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const result = await post('/tests/run');
      setLastRun(result.at);
      setVersion((v) => v + 1);
      toast(`Scanned ${result.ran} tests · ${result.newlyPassing} newly passing, ${result.newlyFailing} newly failing`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  if (!me) return <Loading label="Loading workspace" />;

  return (
    <div className="flex h-full">
      {navOpen && <div className="fixed inset-0 z-40 bg-ink-900/30 lg:hidden" onClick={() => setNavOpen(false)} />}
      <Sidebar user={me.user} company={me.company} onSignOut={signOut} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {me.public_demo && <DemoBanner nextResetAt={me.next_reset_at} sourceUrl={me.source_url} />}
        <Topbar lastRun={lastRun} onScan={runScan} scanning={scanning} onOpenNav={() => setNavOpen(true)} />
        <main key={version} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/frameworks" element={<Frameworks />} />
            <Route path="/frameworks/:slug" element={<FrameworkDetail />} />
            <Route path="/controls" element={<Controls />} />
            <Route path="/controls/:code" element={<ControlDetail />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/monitoring/:slug" element={<TestDetail />} />
            <Route path="/policies" element={<Policies />} />
            <Route path="/policies/:slug" element={<PolicyDetail />} />
            <Route path="/personnel" element={<Personnel />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/risks" element={<Risks />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/audits" element={<Audits />} />
            <Route path="/audits/:id" element={<AuditDetail />} />
            <Route path="/questionnaires" element={<Questionnaires />} />
            <Route path="/questionnaires/:id" element={<QuestionnaireDetail />} />
            <Route path="/trust-center" element={<TrustAdmin />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  // Subscribing to the location makes this component re-render on navigation,
  // so the auth check is re-evaluated after sign in and sign out.
  useLocation();
  const authed = !!getToken();
  return (
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/trust" element={<TrustCenter />} />
      <Route path="/*" element={authed ? <Shell /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
