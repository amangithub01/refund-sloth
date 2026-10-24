import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Mail, ScrollText, Search } from 'lucide-react';
import { api, useEvents, useHealth, useMail, useStats } from './api';
import UrgentBanner from './components/UrgentBanner';
import MailConnect from './components/MailConnect';
import Today from './components/Today';
import Deadlines from './components/Deadlines';
import Subscriptions from './components/Subscriptions';
import Queue from './components/Queue';
import LogDrawer from './components/LogDrawer';
import NeedsLook from './components/NeedsLook';
import { Loader, Logo } from './components/ui';

const TABS = ['Today', 'Deadlines', 'Subscriptions', 'Action queue'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const qc = useQueryClient();
  const slug = (t: Tab) => t.toLowerCase().replace(' ', '-');
  const [tab, setTabState] = useState<Tab>(() => TABS.find((t) => `#${slug(t)}` === location.hash) ?? 'Today');
  const setTab = (t: Tab) => { setTabState(t); history.replaceState(null, '', `#${slug(t)}`); };
  const [logOpen, setLogOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const { data: mail } = useMail();
  const [err, setErr] = useState<string | null>(null);
  const { data: health } = useHealth();
  const { data: stats } = useStats();
  const { events, running: live } = useEvents();
  const running = live || !!health?.running;
  const today = stats?.today ?? health?.today;
  const boss = health?.models[0];
  const wake = async () => {
    setErr(null);
    try { await api.post('/api/run'); setLogOpen(true); qc.invalidateQueries({ queryKey: ['health'] }); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <a href="#home" className="flex items-center gap-2 font-heading text-lg font-medium tracking-tight" title="Back to the landing page">
            <Logo /> Refund Sloth
          </a>
          <nav className="flex flex-wrap gap-1 rounded-full border border-line bg-paper/70 p-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full px-3.5 py-1.5 text-sm transition ${tab === t ? 'bg-ink text-paper shadow-sm' : 'text-stone-dark hover:text-ink'}`}>
                {t}{t === 'Action queue' && stats?.pending_actions ? <span className="num ml-1.5 text-xs opacity-70">{stats.pending_actions}</span> : null}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
            {!!stats?.needs_review && <button className="btn-ghost" onClick={() => setLookOpen(true)}><Search size={14} /> Needs a look <span className="num rounded-full bg-gold/50 px-1.5 text-xs">{stats.needs_review}</span></button>}
            <button className="btn-ghost" onClick={() => setMailOpen(true)} title={mail?.connected ? `Reading ${mail.user} (read-only)` : 'Connect Gmail / Outlook (read-only)'}>
              <Mail size={14} /> {mail?.connected ? <><span className="size-1.5 rounded-full bg-positive" /> Mail</> : <><span className="hidden sm:inline">Connect</span> mail</>}
            </button>
            <button className="btn-ghost" onClick={() => setLogOpen(true)}><ScrollText size={14} /> <span className="hidden sm:inline">Agent</span> log</button>
            <button className="btn-primary" disabled={running} onClick={wake}>{running ? 'Working slowly…' : <>Wake<span className="hidden sm:inline"> the sloth</span> <ArrowRight size={14} /></>}</button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 pt-6">
        {health && (
          <span className={`chip border ${health.ollama ? 'border-line bg-ivory text-stone-dark' : 'border-negative/30 bg-negative-soft/40 text-negative'}`}>
            <span className={`size-1.5 rounded-full ${health.ollama ? 'bg-positive' : 'bg-negative'}`} />
            {health.ollama ? `${boss?.name ?? 'local model'} · running locally, no cloud` : 'Ollama offline'}
          </span>
        )}
        {today && <span className="eyebrow">Today · {today}</span>}
      </div>
      <main className="mx-auto max-w-6xl px-5 py-6">
        {err && <div className="card mb-4 border-negative/30! text-negative">{err}</div>}
        {today && <div className="mb-6"><UrgentBanner today={today} goQueue={() => setTab('Action queue')} /></div>}
        {!today && <Loader label="Waking up" />}
        {today && tab === 'Today' && <Today today={today} />}
        {today && tab === 'Deadlines' && <Deadlines today={today} />}
        {tab === 'Subscriptions' && <Subscriptions goQueue={() => setTab('Action queue')} />}
        {tab === 'Action queue' && <Queue />}
      </main>
      <footer className="eyebrow pb-10 pt-4 text-center text-[10px]">Runs 100% on your machine with open-weight models via Ollama · nothing leaves this laptop</footer>
      <LogDrawer open={logOpen} onClose={() => setLogOpen(false)} events={events} />
      {lookOpen && <NeedsLook onClose={() => setLookOpen(false)} />}
      {mailOpen && <MailConnect onClose={() => setMailOpen(false)} />}
    </div>
  );
}
