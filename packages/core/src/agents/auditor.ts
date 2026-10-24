import {
  addMonthsISO, addDaysISO, AuditResult, differenceDays, modelFor, today,
  type BankTxn, type SubFlag, type SubscriptionCategory,
} from '@sloth/shared';
import { log } from '../events.ts';
import { prompt } from '../prompts.ts';
import type { SlothContext } from '../context.ts';

export interface Candidate {
  normalized_name: string; cadence: 'weekly' | 'monthly' | 'yearly'; monthly_cost: number; first_seen: string; last_charged: string;
  charge_count: number; last_amount: number; prev_amount: number | null; price_change: number; flags: SubFlag[];
}

/** "NETFLIX.COM 866-579-7172 CA" -> "NETFLIX" */
export function normalizeDescription(desc: string): string {
  let s = desc.toUpperCase();
  s = s.replace(/#\S*/g, ' ').replace(/\*/g, ' ').replace(/WWW\./g, ' ').replace(/\.COM\b/g, ' ').replace(/\/BILL\b/g, ' ');
  s = s.replace(/[A-Z]*\d[A-Z\d-]*/g, ' ');          // tokens containing digits (phone numbers, store ids, refs)
  s = s.replace(/[^A-Z&+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(USA|US|INC|LLC|SUBSCR|SUBSCRIPTION|HELP|BILL)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // drop a trailing US state code, then a trailing well-known city ("BOSTON MA", "SAN FRANCISCO CA")
  s = s.replace(/(?<=\S)\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/, '');
  s = s.replace(/(?<=\S)\s+(BOSTON|SAN FRANCISCO|SAN JOSE|LOS ANGELES|NEW YORK|SEATTLE|CHICAGO|AUSTIN|LOS GATOS|CUPERTINO|SUNNYVALE|MOUNTAIN VIEW|DENVER|ATLANTA|MIAMI)$/, '');
  const words = s.split(' ').filter(Boolean);
  // collapse "DROPBOX DROPBOX" style repeats
  return words.filter((w, i) => words.indexOf(w) === i).join(' ').trim() || desc.toUpperCase().trim();
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Deterministic recurring-charge detection. */
export function findRecurring(txns: BankTxn[], todayISO = today()): Candidate[] {
  const clusters: { name: string; txns: BankTxn[] }[] = [];
  for (const t of [...txns].sort((a, b) => a.date.localeCompare(b.date))) {
    const name = normalizeDescription(t.description);
    const c = clusters.find((c) => c.name === name && Math.max(c.txns.at(-1)!.amount, t.amount) / Math.min(c.txns.at(-1)!.amount, t.amount) <= 1.6);
    if (c) c.txns.push(t); else clusters.push({ name, txns: [t] });
  }
  const sameNameCount = (n: string) => clusters.filter((c) => c.name === n).length;
  const out: Candidate[] = [];
  for (const c of clusters) {
    const dates = c.txns.map((t) => t.date);
    const gaps = dates.slice(1).map((d, i) => differenceDays(d, dates[i]!));
    const within = (lo: number, hi: number) => gaps.length > 0 && gaps.filter((g) => g >= lo && g <= hi).length / gaps.length >= 0.7;
    let cadence: Candidate['cadence'] | null = null;
    if (c.txns.length >= 3 && within(25, 35)) cadence = 'monthly';
    else if (c.txns.length >= 4 && within(6, 8)) cadence = 'weekly';
    else if (c.txns.length >= 2 && within(350, 380)) cadence = 'yearly';
    else if (c.txns.length === 1 && /\b(ANNUAL|YEARLY|ANNUALLY)\b/.test(c.name)) cadence = 'yearly';
    if (!cadence) continue;
    const last = c.txns.at(-1)!; const prev = c.txns.length > 1 ? c.txns.at(-2)! : null;
    const stale = { weekly: 21, monthly: 45, yearly: 400 }[cadence];
    if (differenceDays(todayISO, last.date) > stale) continue; // no longer charging
    const monthly_cost = cadence === 'monthly' ? last.amount : cadence === 'weekly' ? (last.amount * 52) / 12 : last.amount / 12;
    const price_change = prev ? r2(last.amount - prev.amount) : 0;
    const flags: SubFlag[] = prev && last.amount > prev.amount * 1.05 ? ['price_increase'] : [];
    const name = sameNameCount(c.name) > 1 ? `${c.name} ${last.amount.toFixed(2)}` : c.name;
    out.push({
      normalized_name: name.replace(/\s+(ANNUAL|YEARLY|ANNUALLY)$/, ''), cadence, monthly_cost: r2(monthly_cost), first_seen: c.txns[0]!.date,
      last_charged: last.date, charge_count: c.txns.length, last_amount: last.amount, prev_amount: prev?.amount ?? null, price_change, flags,
    });
  }
  return out.sort((a, b) => b.monthly_cost - a.monthly_cost);
}

const KEYWORD_CATEGORY: [RegExp, SubscriptionCategory][] = [
  [/NETFLIX|HULU|DISNEY|MAX\b|HBO|PEACOCK|PARAMOUNT|PRIME VIDEO|YOUTUBE/, 'streaming'],
  [/SPOTIFY|APPLE MUSIC|TIDAL|DEEZER|PANDORA/, 'music'],
  [/FIT|GYM|PELOTON|YOGA/, 'fitness'],
  [/TIMES|NEWS|POST|JOURNAL|ECONOMIST|NYT/, 'news'],
  [/ICLOUD|DROPBOX|GOOGLE ONE|ONEDRIVE|BACKBLAZE/, 'cloud'],
  [/ADOBE|AI |GITHUB|NOTION|FIGMA|MICROSOFT|CHATGPT|TOOL/, 'software'],
  [/DOORDASH|UBER EATS|HELLOFRESH|GRUBHUB/, 'food'],
];
export const fallbackCategory = (n: string): SubscriptionCategory => KEYWORD_CATEGORY.find(([re]) => re.test(n))?.[1] ?? 'other';

/** Deterministic duplicate/zombie rules applied after categorization. */
export function applyFlagRules<T extends { normalized_name: string; merchant: string; category: SubscriptionCategory; flags: SubFlag[] }>(
  subs: T[],
  mentionedRecently: (merchant: string) => boolean,
): T[] {
  const byCat = new Map<string, T[]>();
  for (const s of subs) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
  for (const [cat, list] of byCat) {
    const dupThreshold = cat === 'streaming' ? 3 : cat === 'music' || cat === 'cloud' || cat === 'fitness' ? 2 : Infinity;
    if (list.length >= dupThreshold) for (const s of list) if (!s.flags.includes('duplicate')) s.flags.push('duplicate');
  }
  for (const s of subs) {
    if (['fitness', 'news', 'software'].includes(s.category) && !mentionedRecently(s.merchant) && !mentionedRecently(s.normalized_name)) {
      if (!s.flags.includes('zombie')) s.flags.push('zombie');
    }
  }
  return subs;
}

const squash = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z]/g, '');

/** Subscription Auditor: deterministic detection + LLM naming/categorization + deterministic flag rules. */
export async function audit(ctx: SlothContext, file: { path: string; name: string }): Promise<number> {
  log('auditor', `reading ${file.name}…`, undefined, 'agent.start');
  const { transactions } = await ctx.hub.call<{ transactions: BankTxn[] }>('docs_read_csv', { path: file.path });
  const candidates = findRecurring(transactions);
  log('auditor', `${transactions.length} charges → ${candidates.length} recurring candidates`);
  if (!candidates.length) return 0;

  const labels = await ctx.llm.chatJSON(AuditResult, {
    model: modelFor(ctx.cfg, 'auditor'), agent: 'auditor', system: prompt('auditor'),
    user: JSON.stringify(candidates.map((c) => ({ normalized_name: c.normalized_name, cadence: c.cadence, amount: c.last_amount }))),
  });
  const labelMap = new Map(labels.ok ? labels.data.subscriptions.map((l) => [l.normalized_name, l]) : []);
  if (!labels.ok) log('auditor', 'LLM labelling failed - using keyword categories');

  const items = await ctx.hub.call<{ merchant: string; purchase_date: string | null }[]>('ledger_list', { entity: 'items', limit: 1000 });
  const since = addDaysISO(today(), -ctx.cfg.zombieDays);
  const recent = items.filter((i) => (i.purchase_date ?? '') >= since).map((i) => squash(i.merchant));
  const mentionedRecently = (m: string) => { const q = squash(m); return q.length > 2 && recent.some((r) => r.includes(q) || q.includes(r)); };

  const subs = applyFlagRules(candidates.map((c) => {
    const l = labelMap.get(c.normalized_name);
    return { ...c, merchant: l?.merchant ?? c.normalized_name, category: l?.category ?? fallbackCategory(c.normalized_name), reason: l?.reason ?? '', flags: [...c.flags] };
  }), mentionedRecently);

  for (const s of subs) {
    const { subscription_id } = await ctx.hub.call<{ subscription_id: string }>('ledger_upsert_subscription', {
      merchant: s.merchant, normalized_name: s.normalized_name, monthly_cost: s.monthly_cost, cadence: s.cadence, first_seen: s.first_seen,
      last_charged: s.last_charged, charge_count: s.charge_count, last_amount: s.last_amount, price_change: s.price_change,
      flags: s.flags, category: s.category, reason: s.reason,
    });
    if (s.cadence === 'yearly') {
      const due = addMonthsISO(s.last_charged, 12);
      if (due >= today()) {
        const { deadline_id } = await ctx.hub.call<{ deadline_id: string }>('ledger_add_deadline', {
          subscription_id, type: 'renewal', due_date: due, amount_at_risk: s.last_amount, source: 'policy', confidence: 0.75,
        });
        const { ics_path } = await ctx.hub.call<{ ics_path: string }>('calendar_create_reminder', {
          deadline_id, title: `renewal: ${s.merchant} ($${s.last_amount})`, description: `${s.merchant} yearly plan renews on ${due}.`,
          due_date: due, days_before: ctx.cfg.reminderDaysBefore,
        });
        await ctx.hub.call('ledger_set_deadline_ics', { deadline_id, ics_path });
      }
    }
  }
  const zombies = subs.filter((s) => s.flags.includes('zombie'));
  const dups = subs.filter((s) => s.flags.includes('duplicate'));
  const raised = subs.filter((s) => s.flags.includes('price_increase'));
  const total = subs.reduce((t, s) => t + s.monthly_cost, 0);
  log('auditor', `${subs.length} subscriptions ($${total.toFixed(2)}/mo) · 🧟 ${zombies.length} zombie (${zombies.map((z) => z.merchant).join(', ') || '-'})` +
    ` · 👯 ${dups.length} overlapping · 📈 ${raised.length} price hike${raised.length === 1 ? '' : 's'}`, { count: subs.length }, 'agent.end');
  return subs.length;
}
