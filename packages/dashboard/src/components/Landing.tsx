import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Menu, Play, ShieldCheck, WifiOff, X } from 'lucide-react';
import { api, money, useDeadlines, useHealth, useStats, useSubs } from '../api';
import { Logo, TYPE_LABEL } from './ui';
import LaptopOrbit from './LaptopOrbit';

const WORDS = ['nap.', 'sleep.', 'binge.', 'do nothing.'];
const LINKS = [['Watch', 'watch'], ['How it works', 'how'], ['Features', 'features'], ['Agents', 'agents'], ['Privacy', 'privacy']] as const;
const FALLBACK_MERCHANTS = ['Adobe', 'Netflix', 'Spotify', 'Planet Fitness', 'Audible', 'Hulu', 'Dell', 'Best Buy', 'Apple Store', 'Dropbox'];
const TYPE_COLOR: Record<string, string> = { trial_end: '#391a18', return_by: '#c8ae82', warranty_until: '#9aa394', renewal: '#a65a49' };

const FEATURES = [
  { t: 'Trial killer', h: 'Free trials, caught before they bill.', d: 'Order emails and sign-up receipts are read overnight. The exact day each trial turns into a charge lands on your timeline.', b: ['Trial-end dates from the email itself', 'Reminders 3 days and 1 day before', 'Cancel email drafted and waiting'] },
  { t: 'Return windows', h: 'Never miss a return-by date again.', d: 'Return deadlines come from the receipt first, then a per-merchant policy file you can edit, and only then a clearly-labelled AI guess.', b: ['Printed date → store policy → AI guess', 'Every guess flagged for a quick check', 'Return request email in one click'] },
  { t: 'Warranty watch', h: 'Know what is still covered.', d: 'Gadgets and appliances get a warranty-until date, so the sloth can nudge you before coverage quietly runs out.', b: ['Long-range “someday” timeline', 'Order numbers kept with every claim', 'Claim email drafted for you'] },
  { t: 'Zombie hunter', h: 'Subscriptions you forgot you pay for.', d: 'Your bank CSV is grouped into recurring charges. Unused, duplicate and price-hiked subscriptions get flagged.', b: ['Zombie, duplicate and price-up flags', 'Monthly and yearly cost at a glance', '“I still use this” to keep one'] },
  { t: 'Ghostwriter', h: 'The awkward emails, already written.', d: 'Polite, firm or “Karen mode” – drafts include order numbers and dates, formatted and ready to paste.', b: ['Editable subject, recipient and body', 'Approve copies it to your clipboard', 'Nothing is ever sent for you'] },
  { t: 'Reminders', h: 'Your calendar does the remembering.', d: 'Every deadline gets an .ics reminder and a local notification, plus a two-line morning brief.', b: ['.ics files for any calendar app', 'macOS notifications', 'Morning brief on the dashboard'] },
];
const AGENT_LIST = [
  { n: 'Scout', m: 'rule-based', d: 'Spots new files in the inbox and sorts them: receipt, order email, PDF invoice or bank CSV.' },
  { n: 'Reader', m: 'qwen2.5vl · vision', d: 'Turns photos, PDFs and emails into strict JSON: merchant, items, amount, dates, order number.' },
  { n: 'Deadline Hawk', m: 'qwen3.5', d: 'Works out trial-end, return-by and warranty dates, then writes .ics reminders.' },
  { n: 'Subscription Auditor', m: 'qwen3.5', d: 'Groups bank charges into subscriptions and flags zombies, duplicates and price hikes.' },
  { n: 'Ghostwriter', m: 'qwen3.5', d: 'Drafts polite, firm or “Karen mode” cancel, return and warranty emails.' },
  { n: 'Sloth Boss', m: 'orchestrator', d: 'Plans the night, re-checks low-confidence results and writes your two-line morning brief.' },
];
const STEPS = [
  { t: 'Drop', d: 'Throw receipts, PDFs, order emails and bank CSVs into ~/RefundSloth/inbox. No sorting, no renaming.' },
  { t: 'Nap', d: 'At 2 AM six local agents read everything, compute deadlines, hunt zombie subscriptions and draft emails.' },
  { t: 'Approve', d: 'In the morning it is one click per draft. The sloth never sends anything on its own.' },
];

export default function Landing({ open }: { open: () => void }) {
  const [word, setWord] = useState(0);
  const [menu, setMenu] = useState(false);
  const [feat, setFeat] = useState(0);
  const [waking, setWaking] = useState(false);
  const { data: health } = useHealth();
  const { data: stats } = useStats();
  const { data: subs = [] } = useSubs();
  const { data: deadlines = [] } = useDeadlines();

  useEffect(() => { const t = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 2400); return () => clearInterval(t); }, []);

  const today = stats?.today ?? health?.today ?? new Date().toISOString().slice(0, 10);
  const upcoming = deadlines.filter((d) => d.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const live = subs.filter((s) => s.status !== 'cancelled');
  const caught = [...new Set([...deadlines.map((d) => d.merchant), ...subs.map((s) => s.merchant)])];
  const merchants = caught.length >= 4 ? caught : FALLBACK_MERCHANTS;
  const go = (id: string) => { setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };
  const wake = async () => { setWaking(true); try { await api.post('/api/run'); } catch { /* already running */ } open(); };
  const busy = waking || !!health?.running;

  // "At risk" card: split by deadline type; "Subscriptions" card: top merchants.
  const riskByType = Object.entries(upcoming.reduce<Record<string, number>>((m, d) => ({ ...m, [d.type]: (m[d.type] ?? 0) + Number(d.amount_at_risk ?? 0) }), {})).sort((a, b) => b[1] - a[1]);
  const riskTotal = riskByType.reduce((t, [, v]) => t + v, 0) || 1;
  const subTotal = live.reduce((t, s) => t + Number(s.monthly_cost), 0);
  const topSubs = [...live].sort((a, b) => b.monthly_cost - a.monthly_cost).slice(0, 6);
  const f = FEATURES[feat]!;

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 bg-cream/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4 lg:gap-10">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 whitespace-nowrap font-heading text-xl font-medium tracking-tight" aria-label="Refund Sloth home">
            <Logo className="size-9" /> Refund Sloth
          </button>
          <nav className="hidden gap-7 whitespace-nowrap text-sm text-stone-dark lg:flex">
            {LINKS.map(([l, id]) => <button key={id} onClick={() => go(id)} className="transition hover:text-ink">{l}</button>)}
          </nav>
          <div className="ml-auto hidden items-center gap-5 whitespace-nowrap lg:flex">
            <button className="text-sm text-stone-dark hover:text-ink" onClick={open}>Dashboard</button>
            <button className="btn-primary" onClick={wake} disabled={busy}>{busy ? 'Working…' : 'Wake the sloth'}</button>
          </div>
          <button className="btn-icon ml-auto lg:hidden" aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={18} /></button>
        </div>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${menu ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-ink/30 backdrop-blur-sm transition-opacity ${menu ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMenu(false)} />
        <aside className={`absolute right-0 top-0 flex h-full w-72 flex-col gap-1 rounded-l-3xl bg-ivory p-6 transition-transform ${menu ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="mb-4 flex items-center justify-between"><Logo /><button className="btn-icon" aria-label="Close menu" onClick={() => setMenu(false)}><X size={18} /></button></div>
          {LINKS.map(([l, id]) => <button key={id} onClick={() => go(id)} className="border-b border-line py-3 text-left font-heading text-lg">{l}</button>)}
          <button className="btn-primary mt-6" onClick={open}>Open dashboard <ArrowRight size={14} /></button>
        </aside>
      </div>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pt-14 text-center md:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-ivory/70 py-1 pl-1 pr-3 shadow-sm">
          <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] text-gold">◆</span>
          <span className="eyebrow text-[10px] text-stone-dark">Open-weight AI · No API keys</span>
        </span>
        <h1 className="mx-auto mt-7 max-w-4xl text-[2.9rem] leading-[0.98] sm:text-7xl md:text-[5.6rem]">
          Get your money <span className="text-stone">back</span><br className="hidden sm:block" />
          <span className="text-stone"> while you </span><span key={word} className="word-in inline-block">{WORDS[word]}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-stone-dark md:text-lg">
          Refund Sloth reads your receipts, order emails and bank statements overnight, catches trials, return windows,
          warranties and zombie subscriptions, and leaves ready-to-send emails by morning.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className="btn-primary px-6! py-3!" disabled={busy} onClick={wake}>{busy ? 'Working slowly…' : <>Wake the sloth <ArrowRight size={15} /></>}</button>
          <button className="btn-ghost px-6! py-3!" onClick={() => go('watch')}><Play size={14} /> Watch the 55s demo</button>
        </div>
      </section>

      <LaptopOrbit />

      {/* Launch video */}
      <section id="watch" className="mx-auto max-w-5xl scroll-mt-20 px-5 pb-24">
        <div className="text-center">
          <div className="eyebrow">See it in 55 seconds</div>
          <h2 className="mt-5 text-3xl md:text-5xl">Drop. Nap. Approve. <span className="text-stone">Watch how it works.</span></h2>
        </div>
        <div className="mt-10 overflow-hidden rounded-[1.75rem] border border-line bg-ink p-2 shadow-2xl shadow-ink/20">
          <video className="aspect-video w-full rounded-[1.35rem] bg-ink" src="/launch.mp4" poster="/launch-poster.jpg"
            controls playsInline preload="metadata" aria-label="Refund Sloth launch video: how the app works" />
        </div>
      </section>

      {/* Meet + live cards */}
      <section className="mx-auto grid max-w-6xl items-end gap-10 px-5 pb-20 md:grid-cols-[1fr_1.5fr]">
        <div>
          <div className="eyebrow flex items-center gap-3"><span className="h-px w-8 bg-stone-light" />Meet Refund Sloth</div>
          <p className="mt-4 max-w-sm text-stone-dark">Six small agents on your own laptop turn a messy pile of receipts and statements into a calm list of deadlines, savings and drafted emails.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <button onClick={open} className="card text-left transition hover:-translate-y-0.5">
            <div className="flex justify-between"><span className="text-sm font-medium">Money at risk</span><span className="eyebrow text-[10px]">Open</span></div>
            <div className="num mt-3 text-3xl tracking-tight">{money(stats?.at_risk ?? 0, 0)}</div>
            <div className="mt-1 text-xs text-stone-dark">{stats?.open_deadlines ?? 0} open deadlines</div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-cream-dark">
              {riskByType.map(([t, v]) => <span key={t} style={{ width: `${(v / riskTotal) * 100}%`, background: TYPE_COLOR[t] }} />)}
            </div>
            <ul className="mt-3 space-y-1.5 text-xs">
              {riskByType.slice(0, 3).map(([t, v]) => (
                <li key={t} className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}<span className="num ml-auto">{money(v, 0)}</span></li>
              ))}
            </ul>
          </button>
          <button onClick={open} className="card text-left transition hover:-translate-y-0.5">
            <div className="flex justify-between"><span className="text-sm font-medium">Subscriptions</span><span className="eyebrow text-[10px]">Monthly</span></div>
            <div className="num mt-3 text-3xl tracking-tight">{money(subTotal)}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-stone-dark">
              <span className="chip num bg-positive-soft/50 text-positive">−{money(stats?.cuttable_monthly ?? 0)}</span> cuttable
            </div>
            <div className="mt-4 flex h-14 items-end gap-1.5">
              {topSubs.map((s) => (
                <span key={s.id} title={`${s.merchant} ${money(s.monthly_cost)}`} className={`flex-1 rounded-t-md ${s.flags.length ? 'bg-ink' : 'bg-stone-light/60'}`}
                  style={{ height: `${Math.max(14, (s.monthly_cost / (topSubs[0]?.monthly_cost || 1)) * 100)}%` }} />
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-[11px] text-stone-dark"><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-ink" />flagged</span><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-stone-light/60" />keeping</span></div>
          </button>
        </div>
      </section>

      <section className="border-y border-line bg-paper/60 py-6">
        <div className="marquee-mask overflow-hidden">
          <div className="marquee flex w-max gap-10">
            {[...merchants, ...merchants].map((m, i) => (
              <span key={i} aria-hidden={i >= merchants.length} className="whitespace-nowrap font-heading text-xl tracking-tight text-stone">{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* About stats */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="eyebrow">About · Life admin, automated</div>
        <h2 className="mt-5 max-w-4xl text-3xl md:text-5xl">
          Refund Sloth does the boring money chores <span className="text-stone">you keep postponing, privately, on hardware you already own.</span>
        </h2>
        <div className="mt-14 grid gap-8 border-t border-line pt-8 sm:grid-cols-3">
          {[['Local agents working overnight', '6'], ['API keys or cloud accounts', '0'], ['Cost per run', '$0']].map(([l, v]) => (
            <div key={l}><div className="text-sm text-stone-dark">{l}</div><div className="mt-2 font-heading text-6xl tracking-tight">{v}</div></div>
          ))}
        </div>
      </section>

      {/* Features: numbered list + preview */}
      <section id="features" className="scroll-mt-20 bg-paper/70 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="eyebrow">Features</div>
          <h2 className="mt-5 max-w-3xl text-3xl md:text-5xl">Everything you keep meaning to do.</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-[1fr_1.3fr]">
            <ol className="divide-y divide-line border-y border-line">
              {FEATURES.map((x, i) => (
                <li key={x.t}>
                  <button onClick={() => setFeat(i)} className={`flex w-full items-center gap-5 py-4 text-left transition ${feat === i ? 'text-ink' : 'text-stone hover:text-ink-muted'}`}>
                    <span className="num text-xs">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-heading text-xl tracking-tight">{x.t}</span>
                    <ArrowUpRight size={16} className={`ml-auto transition ${feat === i ? 'opacity-100' : 'opacity-0'}`} />
                  </button>
                </li>
              ))}
            </ol>
            <div key={feat} className="card word-in p-8!">
              <div className="eyebrow">{String(feat + 1).padStart(2, '0')} · {f.t}</div>
              <h3 className="mt-4 text-3xl">{f.h}</h3>
              <p className="mt-4 text-stone-dark">{f.d}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {f.b.map((b) => <li key={b} className="flex items-center gap-3"><span className="grid size-5 place-items-center rounded-full bg-ink text-gold"><Check size={11} /></span>{b}</li>)}
              </ul>
              <button className="mt-8 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline" onClick={open}>See it in the dashboard <ArrowRight size={14} /></button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <div className="eyebrow">How it works</div>
        <h2 className="mt-5 text-3xl md:text-5xl">Three steps. <span className="text-stone">Two of them are napping.</span></h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.t} className="card p-7!">
              <span className="num text-xs text-stone">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-6 text-3xl">{s.t}</h3>
              <p className="mt-3 text-sm text-stone-dark">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24">
        <div className="eyebrow">The crew · all local</div>
        <h2 className="mt-5 max-w-3xl text-3xl md:text-5xl">Six slow agents. <span className="text-stone">One very short morning.</span></h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_LIST.map((a, i) => (
            <div key={a.n} className="card flex flex-col p-6! transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="num text-xs text-stone">{String(i + 1).padStart(2, '0')}</span>
                <span className="chip border border-line font-mono text-[10px] text-stone-dark">{a.m}</span>
              </div>
              <h3 className="mt-6 text-2xl">{a.n}</h3>
              <p className="mt-2 text-sm text-stone-dark">{a.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-stone-dark">They talk through MCP servers (ledger, docs, calendar, notify, filesystem) and run on Ollama. Swap any model in <code className="num rounded bg-cream-dark px-1.5 py-0.5 text-xs">sloth.config.json</code>.</p>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-20 px-5 pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink px-8 py-16 text-paper md:px-14">
          <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative grid gap-12 md:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold">Privacy</div>
              <h2 className="mt-5 text-3xl md:text-5xl">Your bank statements never leave this laptop.</h2>
              <button className="btn mt-8 bg-paper text-ink hover:bg-ivory" onClick={open}>Open dashboard <ArrowRight size={14} /></button>
            </div>
            <ul className="grid gap-6 self-center text-paper/80 sm:grid-cols-2">
              {[
                [<WifiOff key="w" size={18} />, 'Works offline', 'Open-weight models via Ollama. Turn Wi-Fi off and it keeps working.'],
                [<ShieldCheck key="s" size={18} />, 'Read-only, inbox only', 'Filesystem access is limited to the inbox. Nothing is sent or paid automatically.'],
                [<span key="d" className="num text-sm">$0</span>, 'Free to run', 'No subscription to track your subscriptions.'],
                [<span key="r" className="text-sm">⇄</span>, 'Swap any model', 'Change or fine-tune models per agent in sloth.config.json.'],
              ].map(([icon, t, d]) => (
                <li key={String(t)}>
                  <span className="grid size-9 place-items-center rounded-full border border-gold/40 text-gold">{icon}</span>
                  <div className="mt-3 font-medium text-paper">{t}</div>
                  <div className="mt-1 text-sm">{d}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-8 text-sm text-stone-dark">
          <span className="flex items-center gap-2 font-heading text-base text-ink"><Logo className="size-6" /> Refund Sloth</span>
          <span>MIT · Open-source, local AI</span>
          <span className="eyebrow ml-auto text-[10px]">{health?.models[0]?.name ?? 'local model'} via Ollama</span>
          {LINKS.map(([l, id]) => <button key={id} onClick={() => go(id)} className="hover:text-ink">{l}</button>)}
        </div>
      </footer>
    </div>
  );
}
