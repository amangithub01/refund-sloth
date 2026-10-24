import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Check, PenLine } from 'lucide-react';
import { api, daysLeft, money, useActions, useDeadlines, useStats } from '../api';
import { StoreLink, TYPE_ICON, TYPE_LABEL } from './ui';

const when = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

/** Red strip above the tabs: anything (except warranties) ending within `urgent_days`. */
export default function UrgentBanner({ today, goQueue }: { today: string; goQueue: () => void }) {
  const qc = useQueryClient();
  const { data: stats } = useStats();
  const { data: deadlines = [] } = useDeadlines();
  const { data: actions = [] } = useActions();
  const [hidden, setHidden] = useState<string[]>([]);
  const days = stats?.urgent_days ?? 2;
  const urgent = deadlines
    .filter((d) => d.type !== 'warranty_until' && !hidden.includes(d.id))
    .map((d) => ({ ...d, left: daysLeft(d.due_date, today) }))
    .filter((d) => d.left >= 0 && d.left <= days)
    .sort((a, b) => a.left - b.left);
  if (!urgent.length) return null;
  const done = async (id: string) => { setHidden((h) => [...h, id]); await api.patch(`/api/deadlines/${id}`, { status: 'done' }); qc.invalidateQueries(); };

  return (
    <section className="rounded-2xl border border-negative/30 bg-negative-soft/35 p-4 sm:p-5" role="alert">
      <div className="mb-3 flex items-center gap-2 text-negative">
        <AlarmClock size={17} className="animate-pulse" />
        <span className="eyebrow text-negative!">Ends in the next {days} days · act now, nap later</span>
      </div>
      <ul className="space-y-2">
        {urgent.map((d) => {
          const draft = actions.find((a) => a.deadline_id === d.id || (d.type === 'trial_end' && a.merchant === d.merchant));
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-paper/80 px-3 py-2.5">
              <span className="text-lg">{TYPE_ICON[d.type]}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.merchant}{d.item_name ? ` – ${d.item_name}` : ''}</div>
                <div className="text-xs text-stone-dark">
                  {TYPE_LABEL[d.type]} <b className="text-negative">{when(d.left)}</b> ({d.due_date}){d.amount_at_risk ? <> · <span className="num">{money(d.amount_at_risk)}</span> at stake</> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StoreLink small links={d.links} kind={d.type === 'return_by' ? 'return' : 'cancel'} />
                {draft && <button className="btn-ghost px-3! py-1.5! text-xs!" onClick={goQueue}><PenLine size={12} /> Draft email</button>}
                <button className="btn-primary px-3! py-1.5! text-xs!" onClick={() => done(d.id)} title="I cancelled / returned it"><Check size={12} /> Done</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
