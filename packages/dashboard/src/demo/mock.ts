// In-browser stand-in for the local API, used by the hosted demo (VITE_DEMO=1).
// Data is a snapshot of a real run on the fake fixtures; changes live only in this tab.
import snapshot from './snapshot.json';
import type { Action, Deadline, SlothEvent, Stats, Subscription } from '../api';

type Snap = typeof snapshot;
type State = Omit<Snap, 'stats' | 'deadlines' | 'subs' | 'actions' | 'review'> & { stats: Stats; deadlines: Deadline[]; subs: Subscription[]; actions: Action[]; review: { id: string }[] };
const state = structuredClone(snapshot) as unknown as State;
const listeners = new Set<(e: SlothEvent) => void>();
const history: SlothEvent[] = [...(snapshot.events as unknown as SlothEvent[])];
let running = false;

export const DEMO_NOTE = 'This is the hosted demo with sample data. Mail sync and real agents run only on your own machine.';

export function subscribe(fn: (e: SlothEvent) => void) {
  history.forEach(fn);
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const emit = (e: Omit<SlothEvent, 'ts'>) => {
  const ev = { ...e, ts: new Date().toISOString() } as SlothEvent;
  history.push(ev);
  listeners.forEach((fn) => fn(ev));
};

function replayRun() {
  if (running) throw new Error('The sloth is already working.');
  running = true;
  const evs = snapshot.events as unknown as SlothEvent[];
  const start = evs.map((e) => e.type).lastIndexOf('run.start');
  const script = evs.slice(start >= 0 ? start : 0);
  script.forEach((e, i) => setTimeout(() => {
    emit({ type: e.type, agent: e.agent, message: e.message, data: e.data });
    if (e.type === 'run.end' || i === script.length - 1) running = false;
  }, 300 + i * 450));
}

const bySaving = (a: Action) => {
  const s = state.stats;
  if (a.saving_period === 'monthly') { s.saved_monthly += a.potential_saving; s.saved_yearly_total += a.potential_saving * 12; }
  else s.saved_one_time += a.potential_saving;
};

export async function mockRequest(url: string, init?: RequestInit): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : {};
  const path = url.split('?')[0];
  const id = path.split('/')[3];

  if (method === 'GET') {
    switch (path) {
      case '/api/health': return { ...state.health, running };
      case '/api/stats': return state.stats;
      case '/api/deadlines': return state.deadlines.filter((d) => d.status === 'open');
      case '/api/subscriptions': return state.subs;
      case '/api/actions': return state.actions.filter((a) => a.status === 'pending');
      case '/api/items': return state.review;
      case '/api/brief/latest': return state.brief;
      case '/api/mail': return { connected: false };
      case '/api/runs': return state.runs;
    }
  }
  if (method === 'POST' && path === '/api/run') { replayRun(); return { ok: true }; }
  if (path.startsWith('/api/mail')) throw new Error(DEMO_NOTE);

  if (method === 'PATCH' && path.startsWith('/api/deadlines/')) {
    const d = state.deadlines.find((x) => x.id === id);
    if (d && body.status && d.status === 'open') {
      d.status = body.status;
      state.stats.open_deadlines -= 1;
      state.stats.at_risk = Math.max(0, state.stats.at_risk - (d.amount_at_risk ?? 0));
    }
    return d;
  }
  if (method === 'PATCH' && path.startsWith('/api/subscriptions/')) {
    const s = state.subs.find((x) => x.id === id);
    if (s) Object.assign(s, body);
    return s;
  }
  if (method === 'PATCH' && path.startsWith('/api/actions/')) {
    const a = state.actions.find((x) => x.id === id);
    if (a) Object.assign(a, body);
    return a;
  }
  if (method === 'POST' && path.endsWith('/decision')) {
    const a = state.actions.find((x) => x.id === id);
    if (a && a.status === 'pending') {
      a.status = body.decision;
      state.stats.pending_actions -= 1;
      if (body.decision === 'approved') bySaving(a);
      emit({ type: 'action.decided', agent: 'you', message: `${body.decision}: ${a.title}` });
    }
    return a;
  }
  if (method === 'PATCH' && path.startsWith('/api/items/')) {
    state.review = state.review.filter((x) => x.id !== id);
    state.stats.needs_review = state.review.length;
    return { ok: true };
  }
  throw new Error(`Not available in the demo: ${method} ${path}`);
}
