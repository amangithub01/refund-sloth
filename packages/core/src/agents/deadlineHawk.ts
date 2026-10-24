import {
  addDaysISO, addMonthsISO, matchPolicy, modelFor, PolicyGuess, today,
  type DeadlineSource, type DeadlineType, type ExtractedItem, type PolicyTable,
} from '@sloth/shared';
import { log } from '../events.ts';
import { prompt } from '../prompts.ts';
import type { SlothContext } from '../context.ts';
import type { SavedItem } from './reader.ts';

export interface ComputedDeadline { type: DeadlineType; due_date: string; source: DeadlineSource; confidence: number; amount_at_risk: number | null }
type Guess = { returnDays: number | null; warrantyMonths: number | null; trialDays: number | null } | null;

const WARRANTY_MIN_AMOUNT = 50;

/**
 * Pure deadline rules. Priority: printed in the document > policies.json > LLM guess (low confidence).
 * Non-warranty deadlines already in the past are dropped.
 */
export function computeDeadlines(item: ExtractedItem, policies: PolicyTable, guess: Guess = null): ComputedDeadline[] {
  const out: ComputedDeadline[] = [];
  const base = item.purchase_date;
  const { policy, matched } = matchPolicy(item.merchant, policies);
  const def = policies._default ?? {};
  const amt = item.amount;

  const pick = (field: 'returnDays' | 'trialDays' | 'warrantyMonths'): { value: number; source: DeadlineSource; confidence: number } | null => {
    if (matched && policy[field] !== undefined) return { value: policy[field]!, source: 'policy', confidence: 0.8 };
    if (!matched && guess && guess[field] !== null && guess[field] !== undefined) return { value: guess[field]!, source: 'llm_guess', confidence: 0.45 };
    if (!matched && def[field] !== undefined) return { value: def[field]!, source: 'llm_guess', confidence: 0.3 };
    return null;
  };

  if (item.kind === 'purchase') {
    if (item.return_by_date) out.push({ type: 'return_by', due_date: item.return_by_date, source: 'document', confidence: 0.95, amount_at_risk: amt });
    else if (base) {
      const p = pick('returnDays');
      if (p && p.value > 0) out.push({ type: 'return_by', due_date: addDaysISO(base, p.value), source: p.source, confidence: p.confidence, amount_at_risk: amt });
    }
    if (base && (amt ?? 0) >= WARRANTY_MIN_AMOUNT) {
      if (item.warranty_months) out.push({ type: 'warranty_until', due_date: addMonthsISO(base, item.warranty_months), source: 'document', confidence: 0.9, amount_at_risk: amt });
      else {
        const p = pick('warrantyMonths');
        if (p && p.value > 0) out.push({ type: 'warranty_until', due_date: addMonthsISO(base, p.value), source: p.source, confidence: p.confidence, amount_at_risk: amt });
      }
    }
  } else if (item.kind === 'trial') {
    if (item.trial_end_date) out.push({ type: 'trial_end', due_date: item.trial_end_date, source: 'document', confidence: 0.95, amount_at_risk: amt });
    else if (item.next_charge_date) out.push({ type: 'trial_end', due_date: item.next_charge_date, source: 'document', confidence: 0.9, amount_at_risk: amt });
    else if (base) {
      const p = pick('trialDays');
      const days = p && p.value > 0 ? p : { value: def.trialDays ?? 30, source: 'llm_guess' as const, confidence: 0.3 };
      out.push({ type: 'trial_end', due_date: addDaysISO(base, days.value), source: days.source, confidence: days.confidence, amount_at_risk: amt });
    }
  } else if (item.kind === 'subscription') {
    if (item.next_charge_date) out.push({ type: 'renewal', due_date: item.next_charge_date, source: 'document', confidence: 0.9, amount_at_risk: amt });
    else if (base) out.push({ type: 'renewal', due_date: addMonthsISO(base, 1), source: 'policy', confidence: 0.6, amount_at_risk: amt });
  }
  const t = today();
  return out.filter((d) => d.type === 'warranty_until' || d.due_date >= t);
}

const ICON: Record<DeadlineType, string> = { return_by: '🛒 return_by', trial_end: '⏳ trial_end', warranty_until: '🛡️ warranty', renewal: '🔁 renewal' };

/** Deadline Hawk: rules first; asks the LLM only for merchants that are not in policies.json. */
export async function hawk(ctx: SlothContext, saved: SavedItem): Promise<number> {
  const { item } = saved;
  if (item.kind === 'other') return 0;
  let guess: Guess = null;
  const needsGuess = !matchPolicy(item.merchant, ctx.policies).matched &&
    ((item.kind === 'purchase' && !item.return_by_date) || (item.kind === 'trial' && !item.trial_end_date && !item.next_charge_date));
  if (needsGuess) {
    const r = await ctx.llm.chatJSON(PolicyGuess, {
      model: modelFor(ctx.cfg, 'deadlineHawk'), agent: 'hawk', system: prompt('deadlineHawk'),
      user: JSON.stringify({ merchant: item.merchant, item: item.item_name, kind: item.kind, amount: item.amount, policy_text: item.policy_text }),
    });
    if (r.ok) { guess = r.data; log('hawk', `no policy on file for ${item.merchant}; best guess: ${r.data.reasoning}`); }
  }
  const deadlines = computeDeadlines(item, ctx.policies, guess);
  const parts: string[] = [];
  for (const d of deadlines) {
    const { deadline_id } = await ctx.hub.call<{ deadline_id: string }>('ledger_add_deadline', { item_id: saved.item_id, ...d });
    if (d.due_date >= today()) {
      const title = `${d.type.replace('_', ' ')}: ${item.merchant}${item.item_name ? ` – ${item.item_name}` : ''}`;
      const desc = `Refund Sloth reminder. ${item.merchant} ${item.order_number ? `order ${item.order_number} ` : ''}` +
        `${item.amount !== null ? `($${item.amount.toFixed(2)}) ` : ''}${d.type.replace('_', ' ')} on ${d.due_date}. Source: ${d.source}.`;
      const { ics_path } = await ctx.hub.call<{ ics_path: string }>('calendar_create_reminder', {
        deadline_id, title, description: desc, due_date: d.due_date, days_before: ctx.cfg.reminderDaysBefore,
      });
      await ctx.hub.call('ledger_set_deadline_ics', { deadline_id, ics_path });
    }
    parts.push(`${ICON[d.type]} ${d.due_date}${d.amount_at_risk ? ` ($${d.amount_at_risk})` : ''}${d.source === 'llm_guess' ? ' (AI guess)' : ''}`);
  }
  if (parts.length) log('hawk', `${item.merchant}: ${parts.join(' · ')}`);
  return deadlines.length;
}
