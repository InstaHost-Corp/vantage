import { Link } from 'react-router-dom';
import { MessageSquareText, Sparkles } from 'lucide-react';
import { useApi } from '../api.js';
import { Button, Card, Loading, PageHeader, Pill, Progress, cx, daysUntil, formatDate } from '../ui.jsx';

export default function Questionnaires() {
  const { data, loading } = useApi('/questionnaires');
  if (loading || !data) return <Loading label="Loading questionnaires" />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Security questionnaires"
        description="Explore questionnaire drafting from fictional controls and policies. Every answer requires human review before any real use."
      />

      <div className="grid gap-5 md:grid-cols-2">
        {data.map((q) => {
          const pct = q.total ? Math.round((q.answered / q.total) * 100) : 0;
          const days = daysUntil(q.due_date);
          return (
            <Card key={q.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><MessageSquareText size={18} /></span>
                  <div>
                    <p className="font-semibold leading-tight">{q.name}</p>
                    <p className="text-xs text-ink-500">{q.company}</p>
                  </div>
                </div>
                <Pill status={q.status} />
              </div>

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink-500">Answered</span>
                  <span className="font-medium">{q.answered}/{q.total || 0}</span>
                </div>
                <Progress value={pct} />
              </div>

              <p className={cx('mt-3 text-xs', days < 7 ? 'font-medium text-amber-600' : 'text-ink-500')}>
                Due {formatDate(q.due_date)} {days >= 0 ? `· ${days} days left` : `· ${Math.abs(days)} days overdue`}
              </p>

              <Link to={`/questionnaires/${q.id}`}>
                <Button className="mt-4 w-full" variant={q.answered < q.total || q.total === 0 ? 'primary' : 'secondary'} size="sm">
                  {q.answered < (q.total || 1) ? <><Sparkles size={14} /> Answer with Vantage AI</> : 'Review answers'}
                </Button>
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
