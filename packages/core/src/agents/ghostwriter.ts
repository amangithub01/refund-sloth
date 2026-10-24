import { DraftEmail, modelFor, today, type ActionType } from '@sloth/shared';
import type { DeadlineRow, SubscriptionRow } from '@sloth/mcp-ledger';
import { bus, log } from '../events.ts';
import { prompt } from '../prompts.ts';
import { formatEmail } from './format-email.ts';
import type { SlothContext } from '../context.ts';

const URGENT_DAYS = 10;
const WARRANTY_REVIEW_DAYS = 30;

async function draft(ctx: SlothContext, facts: Record<string, unknown>) {
  const deadline = typeof facts.deadline === 'string' ? facts.deadline : null;
  const days_left = deadline ? Math.round((Date.parse(deadline) - Date.parse(today())) / 86400000) : undefined;
  const r = await ctx.llm.chatJSON(DraftEmail, {
    model: modelFor(ctx.cfg, 'ghostwriter'), agent: 'ghost', system: prompt('ghostwriter'),
    user: JSON.stringify({ ...facts, days_left, tone: ctx.cfg.ghostwriterTone, user: ctx.cfg.user }),
  });
  if (r.ok) r.data.body = formatEmail(r.data.body, ctx.cfg.user, typeof facts.merchant === 'string' ? facts.merchant : null);
  return r;
}

async function queue(ctx: SlothContext, a: {
  deadline_id?: string; subscription_id?: string; type: ActionType; title: string; potential_saving: number; saving_period: 'one_time' | 'monthly';
  to_address?: string | null; subject?: string | null; body: string;
}) {
  const r = await ctx.hub.call<{ action_id: string; skipped: boolean }>('ledger_queue_action', a);
  if (!r.skipped) {
    bus.emitEvent({ type: 'action.queued', agent: 'ghost', message: `✍️  drafted "${a.title}"${a.saving_period === 'monthly' ? ` – saves $${a.potential_saving}/mo` : ''}`, data: { action_id: r.action_id } });
    return 1;
  }
  return 0;
}

/** Ghostwriter: drafts emails for urgent deadlines and cuttable subscriptions. Never sends anything. */
export async function ghostwrite(ctx: SlothContext): Promise<number> {
  log('ghost', 'looking for things worth writing about…', undefined, 'agent.start');
  let count = 0;
  const has = async (t: { deadline_id?: string; subscription_id?: string }) => (await ctx.hub.call<{ exists: boolean }>('ledger_has_action', t)).exists;

  const upcoming = await ctx.hub.call<DeadlineRow[]>('ledger_upcoming', { days: WARRANTY_REVIEW_DAYS });
  for (const d of upcoming) {
    if (await has({ deadline_id: d.id })) continue;
    const days = Math.round((Date.parse(d.due_date) - Date.parse(today())) / 86400000);
    const what = d.item_name ? `${d.merchant} ${d.item_name}` : d.merchant;
    if (d.type === 'warranty_until') {
      count += await queue(ctx, {
        deadline_id: d.id, type: 'review', title: `Check your ${what} before its warranty ends (${d.due_date})`, potential_saving: 0, saving_period: 'one_time',
        body: `The warranty on your ${what}${d.purchase_date ? ` (bought ${d.purchase_date})` : ''} ends on ${d.due_date}. Give it a quick once-over: anything broken, rattling or flaky? If so, file a claim before the deadline.`,
      });
      continue;
    }
    if (days > URGENT_DAYS || !['trial_end', 'return_by', 'renewal'].includes(d.type)) continue;
    if (d.type === 'renewal' && !d.subscription_id) continue; // monthly email receipts: handled by the auditor's subscriptions
    const kind = d.type === 'return_by' ? 'return_email' : 'cancel_email';
    const intent = d.type === 'return_by' ? `request a return and full refund for ${what}` :
      d.type === 'trial_end' ? `cancel the ${d.merchant} free trial before it converts to a paid plan` : `cancel the ${d.merchant} plan before it renews`;
    const r = await draft(ctx, {
      intent, merchant: d.merchant, item: d.item_name, order_number: d.order_number, purchase_date: d.purchase_date,
      amount: d.item_amount ?? d.amount_at_risk, deadline: d.due_date, merchant_email: d.merchant_email,
    });
    if (!r.ok) { log('ghost', `⚠️ could not draft for ${d.merchant}`); continue; }
    const title = d.type === 'return_by' ? `Return ${what} by ${d.due_date}` : d.type === 'trial_end' ? `Cancel ${d.merchant} trial by ${d.due_date}` : `Cancel ${d.merchant} before ${d.due_date} renewal`;
    count += await queue(ctx, {
      deadline_id: d.id, type: kind, title, to_address: r.data.to_address ?? d.merchant_email, subject: r.data.subject, body: r.data.body,
      potential_saving: d.amount_at_risk ?? 0, saving_period: d.type === 'return_by' ? 'one_time' : d.type === 'renewal' && d.subscription_id ? 'one_time' : 'monthly',
    });
  }

  // Subscriptions: one cancel draft per zombie, and one per overlapping category (the priciest one).
  const subs = (await ctx.hub.call<SubscriptionRow[]>('ledger_list', { entity: 'subscriptions' })).filter((s) => s.status === 'active');
  const targets = new Map<string, { sub: SubscriptionRow; why: string }>();
  for (const s of subs.filter((s) => s.flags.includes('zombie'))) targets.set(s.id, { sub: s, why: `no sign you've used ${s.merchant} in ${ctx.cfg.zombieDays}+ days` });
  const dupCats = new Map<string, SubscriptionRow[]>();
  for (const s of subs.filter((s) => s.flags.includes('duplicate'))) dupCats.set(s.category ?? 'other', [...(dupCats.get(s.category ?? 'other') ?? []), s]);
  for (const [cat, list] of dupCats) {
    const priciest = [...list].sort((a, b) => b.monthly_cost - a.monthly_cost)[0]!;
    if (!targets.has(priciest.id)) targets.set(priciest.id, { sub: priciest, why: `you pay for ${list.length} ${cat} services (${list.map((l) => l.merchant).join(', ')})` });
  }
  for (const { sub, why } of targets.values()) {
    if (await has({ subscription_id: sub.id })) continue;
    const r = await draft(ctx, {
      intent: `cancel my ${sub.merchant} subscription effective at the end of the current billing period and confirm no further charges`,
      merchant: sub.merchant, amount: sub.last_amount, cadence: sub.cadence, last_charged: sub.last_charged, merchant_email: null,
    });
    if (!r.ok) { log('ghost', `⚠️ could not draft for ${sub.merchant}`); continue; }
    count += await queue(ctx, {
      subscription_id: sub.id, type: 'cancel_email', title: `Cancel ${sub.merchant} (${why})`, to_address: r.data.to_address,
      subject: r.data.subject, body: r.data.body, potential_saving: sub.monthly_cost, saving_period: 'monthly',
    });
  }
  log('ghost', `${count} new draft(s) waiting for your approval`, { count }, 'agent.end');
  return count;
}
