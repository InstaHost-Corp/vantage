import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Loader2, MinusCircle, Search, X, XCircle } from 'lucide-react';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------- formatting */

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', ...opts });
}

export function timeAgo(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const units = [['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]];
  for (const [unit, ms] of units) {
    if (abs >= ms) {
      const n = Math.round(diff / ms);
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-n, unit);
    }
  }
  return 'just now';
}

export const daysUntil = (value) => (value ? Math.ceil((new Date(value).getTime() - Date.now()) / 864e5) : null);
export const titleCase = (s) => String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ----------------------------------------------------------------- toasts */

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-100 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cx('animate-fade-up flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-black/5 backdrop-blur',
            t.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-white text-ink-900')}>
            {t.tone === 'error' ? <XCircle size={17} className="mt-px shrink-0 text-rose-500" /> : <CheckCircle2 size={17} className="mt-px shrink-0 text-emerald-500" />}
            <span className="max-w-xs leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------- primitives */

export function Card({ className, children, ...rest }) {
  return <div className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40', className)} {...rest}>{children}</div>;
}

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...rest }) {
  const variants = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-300',
    secondary: 'border border-slate-300 bg-white text-ink-700 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-ink-700 hover:bg-slate-100',
    danger: 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50',
    dark: 'bg-ink-900 text-white hover:bg-ink-700',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
      variants[variant], sizes[size], className)} {...rest}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

const STATUS_STYLES = {
  ok: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'OK'],
  passing: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Passing'],
  complete: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Complete'],
  approved: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Approved'],
  connected: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Connected'],
  configured: ['bg-blue-50 text-blue-700 ring-blue-600/20', 'Configured'],
  active: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Active'],
  accepted: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Accepted'],
  answered: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'Answered'],
  failing: ['bg-rose-50 text-rose-700 ring-rose-600/20', 'Failing'],
  at_risk: ['bg-rose-50 text-rose-700 ring-rose-600/20', 'At risk'],
  expired: ['bg-rose-50 text-rose-700 ring-rose-600/20', 'Expired'],
  overdue: ['bg-rose-50 text-rose-700 ring-rose-600/20', 'Overdue'],
  denied: ['bg-rose-50 text-rose-700 ring-rose-600/20', 'Denied'],
  in_progress: ['bg-amber-50 text-amber-700 ring-amber-600/20', 'In progress'],
  pending: ['bg-amber-50 text-amber-700 ring-amber-600/20', 'Pending'],
  draft: ['bg-amber-50 text-amber-700 ring-amber-600/20', 'Draft'],
  needs_review: ['bg-amber-50 text-amber-700 ring-amber-600/20', 'Needs review'],
  submitted: ['bg-blue-50 text-blue-700 ring-blue-600/20', 'Submitted'],
  fieldwork: ['bg-blue-50 text-blue-700 ring-blue-600/20', 'Fieldwork'],
  scheduled: ['bg-blue-50 text-blue-700 ring-blue-600/20', 'Scheduled'],
  monitoring: ['bg-blue-50 text-blue-700 ring-blue-600/20', 'Monitoring'],
  ready: ['bg-blue-50 text-blue-700 ring-blue-600/20', 'Audit ready'],
  open: ['bg-slate-100 text-ink-700 ring-slate-500/20', 'Open'],
  disabled: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Deactivated'],
  no_tests: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Manual'],
  not_started: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Not started'],
  unmapped: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Unmapped'],
  available: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Available'],
  unanswered: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Unanswered'],
  offboarded: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Offboarded'],
  not_applicable: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'N/A'],
  closed: ['bg-slate-100 text-ink-500 ring-slate-500/20', 'Closed'],
};

export function Pill({ status, label, className }) {
  const [style, text] = STATUS_STYLES[status] || ['bg-slate-100 text-ink-700 ring-slate-500/20', titleCase(status)];
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', style, className)}>{label || text}</span>;
}

const SEVERITY = {
  critical: 'bg-rose-100 text-rose-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-ink-600',
};

export const Severity = ({ level }) => (
  <span className={cx('inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', SEVERITY[level] || SEVERITY.low)}>{level}</span>
);

export const StatusIcon = ({ status, size = 16 }) => {
  if (status === 'failing' || status === 'at_risk') return <XCircle size={size} className="text-rose-500" />;
  if (status === 'no_tests' || status === 'disabled') return <MinusCircle size={size} className="text-slate-400" />;
  if (status === 'in_progress' || status === 'pending') return <AlertTriangle size={size} className="text-amber-500" />;
  return <CheckCircle2 size={size} className="text-emerald-500" />;
};

export function Progress({ value, className, tone }) {
  const color = tone || (value >= 90 ? 'bg-emerald-500' : value >= 65 ? 'bg-brand-500' : value >= 40 ? 'bg-amber-500' : 'bg-rose-500');
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Donut({ value, size = 132, stroke = 12, color = '#6558f5', label, sublabel }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ecebf5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.max(0, Math.min(100, value))) / 100}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight">{label ?? `${value}%`}</span>
        {sublabel && <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default', icon: Icon, onClick }) {
  const tones = { default: 'text-ink-900', danger: 'text-rose-600', warn: 'text-amber-600', good: 'text-emerald-600' };
  return (
    <Card className={cx('p-4', onClick && 'cursor-pointer transition hover:border-brand-300 hover:shadow-md')} onClick={onClick}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {Icon && <Icon size={16} className="text-slate-400" />}
      </div>
      <p className={cx('mt-2 text-2xl font-semibold tracking-tight', tones[tone])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </Card>
  );
}

export function Table({ head, children, className }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ className, children, ...rest }) => <td className={cx('px-4 py-3 align-middle', className)} {...rest}>{children}</td>;

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
    </div>
  );
}

export function Select({ value, onChange, options, className }) {
  return (
    <div className={cx('relative', className)}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={cx('flex gap-1 border-b border-slate-200', className)}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            active === t.value ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-900')}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-ink-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-900/25 backdrop-blur-[1px]" onClick={onClose} />
      <div className={cx('animate-fade-up relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <Card className="animate-fade-up relative w-full max-w-lg p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </Card>
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-500">
      <Loader2 size={18} className="animate-spin text-brand-500" /> {label}…
    </div>
  );
}

export function EmptyState({ icon: Icon = Check, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="rounded-full bg-slate-100 p-3"><Icon size={20} className="text-slate-400" /></div>
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {breadcrumb}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const AVATAR_COLORS = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700'];

export function Avatar({ name, size = 'md' }) {
  const initials = useMemo(() => String(name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), [name]);
  const color = AVATAR_COLORS[(String(name || '').charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };
  return <span className={cx('inline-flex items-center justify-center rounded-full font-semibold', color, sizes[size])}>{initials}</span>;
}

export function Markdown({ text }) {
  const blocks = String(text || '').split('\n');
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink-700">
      {blocks.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="mt-2 text-xl font-semibold text-ink-900">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="mt-5 text-base font-semibold text-ink-900">{line.slice(3)}</h2>;
        if (line.startsWith('| ')) {
          const cells = line.split('|').slice(1, -1).map((c) => c.trim());
          if (cells.every((c) => /^-+$/.test(c))) return null;
          return (
            <div key={i} className="grid grid-cols-2 gap-2 border-b border-slate-100 py-1.5">
              {cells.map((c, j) => <span key={j} className={j === 0 ? 'font-medium text-ink-900' : ''}>{renderInline(c)}</span>)}
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) return <p key={i} className="pl-4 -indent-4">{renderInline(line)}</p>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**')
    ? <strong key={i} className="font-semibold text-ink-900">{p.slice(2, -2)}</strong>
    : <span key={i}>{p}</span>));
}
