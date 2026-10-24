import { ArrowRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, money, useActions, useStats, useSubs, type Subscription } from '../api';
import { Empty, Stat, StoreLink } from './ui';

const FLAG: Record<string, string> = { zombie: 'Zombie', duplicate: 'Duplicate', price_increase: 'Price up' };
const FLAG_CLS: Record<string, string> = { zombie: 'bg-negative-soft/50 text-negative', duplicate: 'bg-gold/35 text-ink-muted', price_increase: 'bg-terracotta/15 text-terracotta' };

export default function Subscriptions({ goQueue }: { goQueue: () => void }) {
  const qc = useQueryClient();
  const { data = [] } = useSubs();
  const { data: actions = [] } = useActions();
  const { data: stats } = useStats();
  if (!data.length) return <Empty>No subscriptions yet – drop a bank statement CSV into the inbox.</Empty>;
  const live = data.filter((s) => s.status !== 'cancelled');
  const total = live.reduce((t, s) => t + Number(s.monthly_cost), 0);
  const flagged = live.filter((s) => s.status === 'active' && s.flags.length);
  const patch = async (s: Subscription, body: object) => { await api.patch(`/api/subscriptions/${s.id}`, body); qc.invalidateQueries(); };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Monthly total" value={`${money(total)}`} sub={`${money(total * 12, 0)} per year`} />
        <Stat label="Flagged" tone="negative" value={String(flagged.length)} sub="Zombies, duplicates and price hikes" />
        <Stat label="Cuttable" tone="positive" value={money(stats?.cuttable_monthly ?? 0)} sub="per month – zombies, the spare duplicates and price hikes" />
      </div>
      <div className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="eyebrow border-b border-line bg-paper/70 text-left text-[10px]">
            <tr>{['Merchant', 'Category', 'Cadence', 'Monthly', 'Last charged', 'Flags', 'Status', ''].map((h) => <th key={h} className={`whitespace-nowrap px-4 py-3 font-medium ${h === 'Category' ? 'hidden 2xl:table-cell' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="whitespace-nowrap divide-y divide-line">
            {data.map((s) => {
              const draft = actions.find((a) => a.subscription_id === s.id);
              return (
                <tr key={s.id} className={`transition hover:bg-paper/60 ${s.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}>
                  <td className="px-4 py-2.5 font-medium" title={s.reason ?? ''}>{s.merchant}</td>
                  <td className="hidden px-4 py-2.5 capitalize 2xl:table-cell">{s.category ?? '–'}</td>
                  <td className="px-4 py-2.5">{s.cadence}</td>
                  <td className="num px-4 py-2.5">{money(s.monthly_cost)}</td>
                  <td className="num px-4 py-2.5 text-stone-dark">{s.last_charged}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.flags.map((f) => <span key={f} className={`chip ${FLAG_CLS[f] ?? 'bg-cream-dark'}`}>{f === 'price_increase' ? `Price +$${Number(s.price_change).toFixed(2)}` : FLAG[f]}</span>)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><span className={`chip ${s.status === 'keep' ? 'bg-positive-soft/50 text-positive' : 'border border-line text-stone-dark'}`}>{s.status === 'keep' ? 'Keep' : s.status}</span></td>
                  <td className="px-4 py-2.5">
                    {s.status !== 'cancelled' && (
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        {s.status !== 'keep' && <button className="btn-ghost px-3! py-1.5! text-xs!" onClick={() => patch(s, { status: 'keep' })}>Keep</button>}
                        {!s.flags.includes('zombie') && <button className="btn-ghost px-3! py-1.5! text-xs!" onClick={() => patch(s, { unused: true, status: 'active' })}>Unused</button>}
                        {s.status !== 'keep' && <StoreLink small links={s.links} kind="cancel" />}
                        {draft && <button className="btn-primary px-3! py-1.5! text-xs!" onClick={goQueue}>Email draft <ArrowRight size={12} /></button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone">"Unused" marks it as a zombie – the Ghostwriter drafts a cancel email on the next run. "Cancel ↗" opens the service's own cancel page.</p>
    </div>
  );
}
