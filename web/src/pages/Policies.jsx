import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Progress, SearchInput, Table, Td, formatDate, useToast } from '../ui.jsx';

export default function Policies() {
  const { data, loading } = useApi('/policies');
  const [q, setQ] = useState('');
  const toast = useToast();
  if (loading || !data) return <Loading label="Loading policies" />;

  const filtered = data.filter((p) => !q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q.toLowerCase()));
  const grouped = filtered.reduce((acc, p) => { (acc[p.category] ||= []).push(p); return acc; }, {});
  const approved = data.filter((p) => p.status === 'approved').length;
  const avgAcceptance = Math.round(data.reduce((a, p) => a + p.acceptance_pct, 0) / (data.length || 1));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Policies"
        description="Templated policies aligned to your frameworks. Personnel accept policies at hire and after each material revision."
        actions={<Button onClick={() => toast('Policy templates library is available on paid plans')}><Plus size={15} /> Add policy</Button>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Approved</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{approved}<span className="text-base text-ink-500">/{data.length}</span></p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Average acceptance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{avgAcceptance}%</p>
          <Progress value={avgAcceptance} className="mt-2" />
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Headcount in scope</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data[0]?.headcount ?? 0}</p>
        </Card>
      </div>

      <SearchInput value={q} onChange={setQ} placeholder="Search policies…" className="mb-4 w-72" />

      <div className="space-y-5">
        {Object.entries(grouped).map(([category, policies]) => (
          <Card key={category}>
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold">{category}</h2>
            </div>
            <Table head={['Policy', 'Version', 'Status', 'Acceptance', 'Owner', 'Renews']}>
              {policies.map((p) => (
                <tr key={p.slug} className="hover:bg-slate-50/70">
                  <Td>
                    <Link to={`/policies/${p.slug}`} className="flex items-center gap-2 font-medium text-ink-900 hover:text-brand-600">
                      <FileText size={15} className="text-brand-500" /> {p.name}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 max-w-xl pl-6 text-xs text-ink-500">{p.description}</p>
                  </Td>
                  <Td className="text-xs text-ink-500">v{p.version}</Td>
                  <Td><Pill status={p.status} /></Td>
                  <Td className="w-40">
                    <div className="flex items-center gap-2">
                      <Progress value={p.acceptance_pct} className="w-20" />
                      <span className="text-xs tabular-nums text-ink-500">{p.acceptances}/{p.headcount}</span>
                    </div>
                  </Td>
                  <Td className="text-xs text-ink-500">{p.owner}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-500">{formatDate(p.renewal_date)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        ))}
      </div>
    </div>
  );
}
