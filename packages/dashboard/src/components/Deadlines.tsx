import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, X } from 'lucide-react';
import { api, money, useDeadlines } from '../api';
import { Countdown, Empty, SourceBadge, StoreLink, TYPE_ICON, TYPE_LABEL } from './ui';

function weekLabel(due: string, today: string) {
  const d = Math.floor((Date.parse(due) - Date.parse(today)) / 86400000);
  if (d < 7) return 'This week';
  if (d < 14) return 'Next week';
  if (d < 31) return 'Later this month';
  if (d < 92) return 'Next few months';
  return 'Someday (warranties & long windows)';
}

export default function Deadlines({ today }: { today: string }) {
  const qc = useQueryClient();
  const { data = [] } = useDeadlines();
  const upcoming = data.filter((d) => d.due_date >= today);
  const groups = new Map<string, typeof upcoming>();
  for (const d of upcoming) { const k = weekLabel(d.due_date, today); groups.set(k, [...(groups.get(k) ?? []), d]); }
  const set = async (id: string, status: 'done' | 'dismissed') => { await api.patch(`/api/deadlines/${id}`, { status }); qc.invalidateQueries(); };
  if (!upcoming.length) return <Empty>No open deadlines 🎉</Empty>;
  return (
    <div className="space-y-8">
      {[...groups].map(([label, ds]) => (
        <section key={label}>
          <h2 className="eyebrow mb-3 flex items-center gap-3"><span className="h-px w-6 bg-stone-light" />{label}<span className="num text-stone-light">{ds.length}</span></h2>
          <div className="space-y-3">
            {ds.map((d) => (
              <div key={d.id} className="card flex flex-wrap items-center gap-3 py-3.5!">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-xl">{TYPE_ICON[d.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.merchant}{d.item_name ? ` – ${d.item_name}` : ''}</div>
                  <div className="text-xs text-stone-dark">
                    {TYPE_LABEL[d.type]} <b className="font-medium text-ink">{d.due_date}</b> · <span className="num">{money(d.amount_at_risk)}</span>{d.order_number ? ` · order ${d.order_number}` : ''}
                  </div>
                </div>
                <SourceBadge source={d.source} />
                <Countdown due={d.due_date} today={today} />
                <div className="flex items-center gap-1">
                  {d.type !== 'warranty_until' && <StoreLink small links={d.links} kind={d.type === 'return_by' ? 'return' : 'cancel'} />}
                  {d.ics_path && <a className="btn-icon" href={`/api/reminders/${d.id}.ics`} title="Add to calendar"><CalendarPlus size={15} /></a>}
                  <button className="btn-icon" title="Mark done" onClick={() => set(d.id, 'done')}><Check size={15} /></button>
                  <button className="btn-icon" title="Dismiss" onClick={() => set(d.id, 'dismissed')}><X size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
