import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, useBrief, useDeadlines, useStats } from '../api';
import { Countdown, Empty, Logo, Panel, Stat, TYPE_ICON, TYPE_LABEL } from './ui';

export default function Today({ today }: { today: string }) {
  const { data: brief } = useBrief();
  const { data: s } = useStats();
  const { data: deadlines = [] } = useDeadlines();
  const urgent = deadlines.filter((d) => d.due_date >= today && d.due_date <= addDays(today, 7));
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-7 text-paper sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <Logo className="size-8" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold">Morning brief · {today}</span>
          </div>
          {brief ? (
            <>
              <h1 className="mt-5 max-w-3xl text-3xl sm:text-[2.6rem]">{brief.headline}</h1>
              <p className="mt-3 max-w-2xl text-lg text-paper/70">{brief.second_line}</p>
              <details className="mt-5 text-sm text-paper/75">
                <summary className="cursor-pointer select-none text-gold hover:text-paper">Read the full report</summary>
                <div className="mt-3 whitespace-pre-line rounded-2xl bg-ink-soft/70 p-4 leading-relaxed">{brief.markdown.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim()}</div>
              </details>
            </>
          ) : <h1 className="mt-5 text-3xl">No brief yet. Drop files in your inbox and hit <span className="text-gold">Wake the sloth</span>.</h1>}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Saved" tone="positive" value={money(s?.saved_one_time ?? 0, 0)} sub={`+ ${money(s?.saved_monthly ?? 0)}/mo · ${money(s?.saved_yearly_total ?? 0, 0)} per year`} />
        <Stat label="At risk · 30 days" tone="negative" value={money(s?.at_risk ?? 0, 0)} sub={`${s?.open_deadlines ?? 0} open deadlines · ${money(s?.cuttable_monthly ?? 0)}/mo cuttable`} />
        <Stat label="Drafts waiting" value={String(s?.pending_actions ?? 0)} sub="One click each. Nothing is sent for you." />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Urgent" meta="Next 7 days">
          {urgent.length ? (
            <ul className="divide-y divide-line">
              {urgent.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-lg">{TYPE_ICON[d.type]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.merchant}{d.item_name ? ` – ${d.item_name}` : ''}</div>
                    <div className="text-xs text-stone-dark">{TYPE_LABEL[d.type]} {d.due_date} · <span className="num">{money(d.amount_at_risk)}</span></div>
                  </div>
                  <Countdown due={d.due_date} today={today} />
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing urgent. Back to napping.</Empty>}
        </Panel>
        <Panel title="Money saved" meta="Over time">
          {s?.timeline.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={s.timeline} margin={{ left: -8, right: 8, top: 8 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8ae82" stopOpacity={0.55} /><stop offset="100%" stopColor="#c8ae82" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7d796f', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#7d796f', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: '#faf8f2', border: '1px solid #391a181f', borderRadius: 12, color: '#391a18' }} />
                <Area type="monotone" dataKey="total" stroke="#391a18" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty>Approve a draft and watch this grow.</Empty>}
        </Panel>
      </div>
    </div>
  );
}

function addDays(iso: string, n: number) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
