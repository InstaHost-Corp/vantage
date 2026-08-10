import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Copy, Sparkles } from 'lucide-react';
import { patch, post, useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Progress, cx, formatDate, useToast } from '../ui.jsx';

export default function QuestionnaireDetail() {
  const { id } = useParams();
  const [version, setVersion] = useState(0);
  const { data, loading } = useApi(`/questionnaires/${id}`, [version]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const toast = useToast();

  if (loading || !data) return <Loading label="Loading questionnaire" />;
  const answered = data.items.filter((i) => i.status !== 'unanswered').length;
  const pct = data.items.length ? Math.round((answered / data.items.length) * 100) : 0;

  const autofill = async () => {
    setBusy(true);
    try {
      const res = await post(`/questionnaires/${id}/autofill`);
      toast(res.filled ? `Drafted ${res.filled} answers from your control set` : 'No unanswered questions left');
      setVersion((v) => v + 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async (item) => {
    await patch(`/questionnaire-items/${item.id}`, { answer: draft });
    setEditing(null);
    setVersion((v) => v + 1);
    toast('Answer saved');
  };

  const copyAll = () => {
    const text = data.items.map((i) => `Q: ${i.question}\nA: ${i.answer || '(unanswered)'}`).join('\n\n');
    navigator.clipboard?.writeText(text);
    toast('Questionnaire copied to clipboard');
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={<Link to="/questionnaires" className="mb-1 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-600">Questionnaires <ChevronRight size={12} /> {data.company}</Link>}
        title={data.name}
        description={`Requested by ${data.company} · due ${formatDate(data.due_date)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={copyAll}><Copy size={15} /> Copy all</Button>
            <Button loading={busy} onClick={autofill}><Sparkles size={15} /> Auto-answer</Button>
          </div>
        }
      />

      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500">Progress</span>
          <span className="font-medium">{answered} of {data.items.length} answered</span>
        </div>
        <Progress value={pct} className="mt-2" />
        <p className="mt-2 text-xs text-ink-500">
          Answers are generated from your controls and approved policies, with a confidence score. Anything below 70% is flagged for review.
        </p>
      </Card>

      <div className="space-y-4">
        {data.items.map((item, index) => (
          <Card key={item.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium text-ink-900">
                <span className="mr-2 text-ink-500">{index + 1}.</span>{item.question}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {item.confidence != null && (
                  <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold',
                    item.confidence >= 85 ? 'bg-emerald-50 text-emerald-700' : item.confidence >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700')}>
                    {item.confidence}%
                  </span>
                )}
                <Pill status={item.status} />
              </div>
            </div>

            {editing === item.id ? (
              <div className="mt-3">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => save(item)}>Save answer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <p className={cx('mt-2 text-sm leading-relaxed', item.answer ? 'text-ink-700' : 'italic text-ink-500')}>
                  {item.answer || 'Not answered yet — run auto-answer or write a response.'}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  {item.source ? <p className="text-xs text-ink-500">Source: {item.source}</p> : <span />}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(item.id); setDraft(item.answer || ''); }}>Edit</Button>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
