import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BellRing, Cpu, Hourglass, MailCheck, PackageOpen, ShieldCheck, Skull, TriangleAlert } from 'lucide-react';
import { daysLeft, money, useBrief, useDeadlines, useHealth, useStats, useSubs } from '../api';
import { Logo } from './ui';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const AGENTS = ['Scout', 'Reader', 'Deadline Hawk', 'Subscription Auditor', 'Ghostwriter', 'Sloth Boss'];
const SCREEN_W = 520;
const SCREEN_H = 325;

interface Orb { icon: ReactNode; label: string; value: string; detail: string; to: string }

/** Scroll progress (0 → 1) of a tall section whose child is `position: sticky`. */
function useScrollStage() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [size, setSize] = useState({ w: 1100, h: 720 });
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = section.current!.getBoundingClientRect();
      const sticky = stage.current!.getBoundingClientRect().height;
      setP(reduce ? 1 : clamp(-(r.top - 64) / Math.max(1, r.height - sticky)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const ro = new ResizeObserver(([e]) => { setSize({ w: e!.contentRect.width, h: e!.contentRect.height }); onScroll(); });
    ro.observe(stage.current!);
    update();
    addEventListener('scroll', onScroll, { passive: true });
    return () => { removeEventListener('scroll', onScroll); ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return { section, stage, p, ...size };
}

export default function LaptopOrbit() {
  const { section, stage, p, w, h } = useScrollStage();
  const { data: stats } = useStats();
  const { data: brief } = useBrief();
  const { data: health } = useHealth();
  const { data: deadlines = [] } = useDeadlines();
  const { data: subs = [] } = useSubs();

  const today = stats?.today ?? health?.today ?? new Date().toISOString().slice(0, 10);
  const open = deadlines.filter((d) => d.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const firstOf = (t: string) => open.find((d) => d.type === t);
  const trial = firstOf('trial_end'), ret = firstOf('return_by');
  const warranties = open.filter((d) => d.type === 'warranty_until');
  const zombies = subs.filter((s) => s.status !== 'cancelled' && s.flags.length);
  const week = open.filter((d) => daysLeft(d.due_date, today) <= 7);
  const model = health?.models[0]?.name ?? 'qwen3.5';

  const orbs: Orb[] = [
    { icon: <Hourglass size={15} />, label: 'Trial killer', value: trial ? `${daysLeft(trial.due_date, today)} days left` : 'Trials', detail: trial ? `${trial.merchant} · ${money(trial.amount_at_risk ?? 0)}` : 'Caught before they bill', to: '#deadlines' },
    { icon: <PackageOpen size={15} />, label: 'Return window', value: ret ? `Return by ${ret.due_date.slice(5)}` : 'Returns', detail: ret ? `${ret.merchant} · ${money(ret.amount_at_risk ?? 0, 0)}` : 'Never miss a return date', to: '#deadlines' },
    { icon: <ShieldCheck size={15} />, label: 'Warranty watch', value: `${warranties.length} covered`, detail: 'Nudged before it ends', to: '#deadlines' },
    { icon: <Skull size={15} />, label: 'Zombie hunter', value: `${zombies.length} flagged`, detail: `${money(stats?.cuttable_monthly ?? 0)}/mo you can cut`, to: '#subscriptions' },
    { icon: <MailCheck size={15} />, label: 'Ghostwriter', value: `${stats?.pending_actions ?? 0} drafts`, detail: 'Cancel & return emails ready', to: '#action-queue' },
    { icon: <BellRing size={15} />, label: 'Reminders', value: `${open.length} .ics files`, detail: '3 days + 1 day before', to: '#deadlines' },
    { icon: <TriangleAlert size={15} />, label: 'Money at risk', value: money(stats?.at_risk ?? 0, 0), detail: `${stats?.open_deadlines ?? 0} open deadlines`, to: '#today' },
    { icon: <Cpu size={15} />, label: '100% local', value: '0 API keys', detail: `${model} via Ollama`, to: '#today' },
  ];

  // Geometry: laptop in the middle, cards on an ellipse that always fits inside the stage.
  const compact = w < 640;
  const cardW = compact ? 138 : 224;
  const cardH = compact ? 62 : 86;
  const cx = w / 2, cy = h / 2;
  const rx = Math.min(compact ? w / 2 - cardW / 2 - 6 : 520, w / 2 - cardW / 2 - 12);
  const ry = Math.max(120, h / 2 - cardH / 2 - 14);
  // Laptop: as big as possible without touching the side cards (vertically on phones, horizontally on desktop).
  const sideEdge = 0.924 * rx - cardW / 2 - 10;
  const roomH = 2 * (0.383 * ry - cardH / 2) - 14;
  const topRoom = 2 * (0.924 * ry - cardH / 2 - 14) - 16; // laptop height must clear the top/bottom cards
  const want = Math.min(560, w * (compact ? 0.68 : 0.44), topRoom / 0.68);
  const laptopW = want / 2 <= sideEdge ? want : Math.max(sideEdge * 2, Math.min(want, roomH / 0.67));
  const lid = ease(p / 0.22);
  const done = ease((p - 0.82) / 0.12);

  const placed = orbs.map((o, i) => {
    const t = ease((p - 0.2 - i * 0.07) / 0.22);
    const a = ((-67.5 + i * 45) * Math.PI) / 180;
    const ox = Math.sign(Math.cos(a)) * Math.max(Math.abs(Math.cos(a)) * rx, cardW / 2 + 6); // keep top/bottom pairs apart
    return { ...o, t, x: cx + ox * t, y: cy + Math.sin(a) * ry * t };
  });

  return (
    <section ref={section} className="relative -mt-[32svh] h-[300vh] md:-mt-[30svh]" aria-label="What Refund Sloth finds while you sleep">
      <div ref={stage} className="sticky top-16 mx-auto h-[calc(100svh-4rem)] max-w-7xl overflow-hidden">
        <div className="hero-glow pointer-events-none absolute left-1/2 top-1/2 size-[min(900px,140vw)] -translate-x-1/2 -translate-y-1/2" />

        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#391a1822" strokeDasharray="2 8" style={{ opacity: done }} />
          {placed.map((o, i) => o.t > 0.02 && (
            <g key={i} style={{ opacity: o.t }}>
              <line x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#391a181f" />
              <line x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#9e8155" strokeWidth="2.5" strokeLinecap="round" className="flow" />
            </g>
          ))}
        </svg>

        {/* Laptop */}
        <div className="absolute left-1/2 top-1/2" style={{ width: laptopW, transform: `translate(-50%, -50%) scale(${0.88 + 0.12 * lid})` }}>
          <div style={{ perspective: 1600 }}>
            <div className="relative rounded-t-[1.1rem] bg-ink-deep p-[2.2%] pb-[3%] shadow-[0_50px_80px_-40px_#391a18aa]"
              style={{ transformOrigin: '50% 100%', transform: `rotateX(${(1 - lid) * -62}deg)` }}>
              <span className="absolute left-1/2 top-[0.9%] size-1 -translate-x-1/2 rounded-full bg-stone-dark" />
              <div className="relative overflow-hidden rounded-md bg-cream" style={{ aspectRatio: `${SCREEN_W} / ${SCREEN_H}` }}>
                <div className="origin-top-left" style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${(laptopW * 0.956) / SCREEN_W})` }}>
                  <Screen p={p} headline={brief?.headline ?? `${week.length} deadlines this week · ${money(stats?.cuttable_monthly ?? 0)}/mo you can cut · ${stats?.pending_actions ?? 0} drafts ready`}
                    stats={[['Saved', money(stats?.saved_one_time ?? 0, 0)], ['At risk', money(stats?.at_risk ?? 0, 0)], ['Drafts', String(stats?.pending_actions ?? 0)]]}
                    rows={open.slice(0, 5).map((d) => [d.merchant, d.item_name ?? '', `${daysLeft(d.due_date, today)}d`])} />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent" />
              </div>
            </div>
          </div>
          <div className="relative -mx-[7%] h-[clamp(8px,1.6vw,14px)] rounded-b-[1.2rem] bg-gradient-to-b from-[#ddd8c6] to-[#a8a398] shadow-[0_18px_30px_-12px_#391a1877]">
            <span className="absolute left-1/2 top-0 h-1/2 w-[16%] -translate-x-1/2 rounded-b-md bg-[#c9c3b1]" />
          </div>
        </div>

        {/* Orbiting feature cards */}
        {placed.map((o, i) => (
          <a key={o.label} href={o.to} tabIndex={o.t > 0.9 ? 0 : -1}
            className="card group absolute flex items-center gap-2.5 p-0! transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-gold-dark"
            style={{ width: cardW, height: cardH, left: o.x - cardW / 2, top: o.y - cardH / 2, opacity: o.t, transform: `scale(${0.6 + 0.4 * o.t})`, pointerEvents: o.t > 0.9 ? 'auto' : 'none', padding: compact ? '0 10px' : '0 14px' }}>
            <span className={`grid shrink-0 place-items-center rounded-xl ${i === 3 || i === 6 ? 'bg-ink text-gold' : 'bg-cream-dark text-ink'} ${compact ? 'size-8' : 'size-10'}`}>{o.icon}</span>
            <span className="min-w-0 leading-tight">
              <span className={`eyebrow block truncate ${compact ? 'text-[8.5px] tracking-[0.14em]' : 'text-[10px]'}`}>{o.label}</span>
              <span className={`block truncate font-heading font-medium tracking-tight ${compact ? 'text-[13px]' : 'text-[17px]'}`}>{o.value}</span>
              {!compact && <span className="block truncate text-xs text-stone-dark">{o.detail}</span>}
            </span>
          </a>
        ))}

        <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center" style={{ opacity: 1 - ease(p / 0.12) }}>
          <span className="eyebrow inline-flex items-center gap-2 rounded-full bg-ivory/80 px-3 py-1.5 text-[10px]">Scroll to wake the sloth <span className="animate-bounce">↓</span></span>
        </div>
      </div>
    </section>
  );
}

/** The mini dashboard shown on the laptop screen (fixed 520×325 canvas, scaled to fit). */
function Screen({ p, headline, stats, rows }: { p: number; headline: string; stats: string[][]; rows: string[][] }) {
  const working = 1 - ease((p - 0.24) / 0.08);
  return (
    <div className="relative size-full p-3.5 text-ink">
      <div className="flex items-center gap-1.5">
        <Logo className="size-4" /><span className="font-heading text-[11px] font-medium">Refund Sloth</span>
        <span className="ml-3 flex gap-1">{['Today', 'Deadlines', 'Subscriptions', 'Queue'].map((t, i) => <span key={t} className={`rounded-full px-2 py-0.5 text-[8px] ${i === 0 ? 'bg-ink text-paper' : 'text-stone-dark'}`}>{t}</span>)}</span>
        <span className="ml-auto rounded-full border border-line bg-ivory px-2 py-0.5 text-[8px]">● local</span>
      </div>
      <div className="relative mt-2.5 overflow-hidden rounded-xl bg-ink p-3.5 text-paper">
        <span className="absolute -right-6 -top-10 size-28 rounded-full bg-gold/25 blur-2xl" />
        <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-gold">Morning brief</div>
        <div className="mt-1 font-heading text-[15px] leading-tight tracking-tight">{headline.replace(/^🦥\s*/, '')}</div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {stats.map(([l, v], i) => (
          <div key={l} className="rounded-lg border border-line bg-card px-2.5 py-1.5">
            <div className="font-mono text-[6.5px] uppercase tracking-[0.2em] text-stone">{l}</div>
            <div className={`num text-[15px] ${i === 0 ? 'text-positive' : i === 1 ? 'text-negative' : ''}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-line bg-card px-2.5 py-1">
        {rows.map(([m, item, d]) => (
          <div key={m + item} className="flex items-center gap-2 border-b border-line py-1 text-[9px] last:border-0">
            <span className="font-medium">{m}</span><span className="truncate text-stone-dark">{item}</span>
            <span className="ml-auto rounded-full bg-gold/35 px-1.5 text-[8px]">{d}</span>
          </div>
        ))}
      </div>

      {/* Overnight run overlay: agents tick off as you scroll */}
      <div className="absolute inset-0 grid place-items-center bg-ink-deep text-paper" style={{ opacity: working, pointerEvents: 'none' }}>
        <div className="w-60">
          <div className="flex items-center gap-2"><Logo className="size-6" /><span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold">{p < 0.02 ? 'zzz… 2:00 AM' : 'Overnight run'}</span></div>
          <ul className="mt-3 space-y-1 font-mono text-[10px]">
            {AGENTS.map((a, i) => {
              const ok = p > 0.03 + i * 0.035;
              return <li key={a} className={`flex justify-between ${ok ? 'text-paper' : 'text-paper/35'}`}><span>{a}</span><span className={ok ? 'text-gold' : ''}>{ok ? '✓ done' : '…'}</span></li>;
            })}
          </ul>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper/15"><div className="h-full bg-gold" style={{ width: `${clamp(p / 0.24) * 100}%` }} /></div>
        </div>
      </div>
    </div>
  );
}
