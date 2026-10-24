import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface StoreLinks { cancel?: string; return?: string }
export interface MailStatus { connected: boolean; user?: string; host?: string; days?: number; last_sync?: string | null; fetched_total?: number; has_password?: boolean }
export type Flag = 'zombie' | 'duplicate' | 'price_increase';
export interface Health { ollama: boolean; models: { name: string; present: boolean; tools: boolean; vision: boolean }[]; profile: string; dataDir: string; running: boolean; today: string }
export interface Stats {
  saved_one_time: number; saved_monthly: number; saved_yearly_total: number; at_risk: number; open_deadlines: number; urgent_deadlines: number;
  pending_actions: number; zombies: number; monthly_subscriptions: number; cuttable_monthly: number; needs_review: number;
  timeline: { day: string; total: number }[]; today: string; urgent_days?: number;
}
export interface Deadline {
  id: string; type: 'trial_end' | 'return_by' | 'warranty_until' | 'renewal'; due_date: string; amount_at_risk: number | null;
  source: 'document' | 'policy' | 'llm_guess'; confidence: number; status: string; ics_path: string | null; merchant: string;
  item_name: string | null; order_number: string | null; links?: StoreLinks;
}
export interface Subscription {
  id: string; merchant: string; normalized_name: string; monthly_cost: number; cadence: string; last_charged: string; charge_count: number;
  last_amount: number | null; price_change: number; flags: Flag[]; category: string | null; reason: string | null; unused: number; status: 'active' | 'cancelled' | 'keep'; links?: StoreLinks;
}
export interface Action {
  id: string; type: string; title: string; to_address: string | null; subject: string | null; body: string; potential_saving: number;
  saving_period: 'one_time' | 'monthly'; status: string; merchant: string | null; due_date: string | null; subscription_id: string | null; deadline_id: string | null; links?: StoreLinks;
}
export interface Item { id: string; merchant: string; item_name: string | null; amount: number | null; purchase_date: string | null; kind: string; confidence: number; order_number: string | null }
export interface Brief { headline: string; second_line: string; markdown: string; finished_at: string }
export interface Run { id: string; started_at: string; finished_at: string | null; status: string; files_processed: number }
export interface SlothEvent { type: string; agent?: string; message: string; ts: string; data?: Record<string, unknown> }

/** Hosted demo build (VITE_DEMO=1): no backend, data comes from a bundled snapshot. */
export const DEMO = import.meta.env.VITE_DEMO === '1';
const demo = () => import('./demo/mock');

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  if (DEMO) return (await demo()).mockRequest(url, init) as Promise<T>;
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json() as Promise<T>;
}
export const api = {
  get: <T,>(u: string) => req<T>(u),
  post: <T,>(u: string, body?: unknown) => req<T>(u, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(u: string, body: unknown) => req<T>(u, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(u: string) => req<T>(u, { method: 'DELETE' }),
};

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: () => api.get<Health>('/api/health'), refetchInterval: 30000 });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/api/stats') });
export const useDeadlines = () => useQuery({ queryKey: ['deadlines'], queryFn: () => api.get<Deadline[]>('/api/deadlines?status=open') });
export const useSubs = () => useQuery({ queryKey: ['subs'], queryFn: () => api.get<Subscription[]>('/api/subscriptions') });
export const useActions = () => useQuery({ queryKey: ['actions'], queryFn: () => api.get<Action[]>('/api/actions?status=pending') });
export const useReview = () => useQuery({ queryKey: ['review'], queryFn: () => api.get<Item[]>('/api/items?needs_review=1') });
export const useBrief = () => useQuery({ queryKey: ['brief'], queryFn: () => api.get<Brief | null>('/api/brief/latest') });
export const useMail = () => useQuery({ queryKey: ['mail'], queryFn: () => api.get<MailStatus>('/api/mail') });
export const useRuns = () => useQuery({ queryKey: ['runs'], queryFn: () => api.get<Run[]>('/api/runs?limit=10') });

/** Live agent log over SSE; refreshes data when a run ends or an action changes. */
export function useEvents() {
  const qc = useQueryClient();
  const [events, setEvents] = useState<SlothEvent[]>([]);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const onEvent = (e: SlothEvent) => {
      setEvents((xs) => (xs.some((x) => x.ts === e.ts && x.message === e.message) ? xs : [...xs.slice(-300), e]));
      if (e.type === 'run.start') setRunning(true);
      if (e.type === 'run.end') { setRunning(false); qc.invalidateQueries(); }
      if (e.type === 'action.queued') qc.invalidateQueries();
    };
    if (DEMO) {
      let off: (() => void) | undefined;
      let gone = false;
      demo().then((m) => { if (!gone) off = m.subscribe(onEvent); });
      return () => { gone = true; off?.(); };
    }
    const es = new EventSource('/api/events');
    es.onmessage = (m) => onEvent(JSON.parse(m.data) as SlothEvent);
    return () => es.close();
  }, [qc]);
  return { events, running };
}

export const money = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '–' : `$${Number(n).toFixed(d)}`);
export const daysLeft = (due: string, today: string) => Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
