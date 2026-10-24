import { Brief, modelFor, today } from '@sloth/shared';
import type { DeadlineRow, Stats, SubscriptionRow } from '@sloth/mcp-ledger';
import { runAgent } from '../agent.ts';
import { log } from '../events.ts';
import { prompt } from '../prompts.ts';
import type { SlothContext } from '../context.ts';

const $ = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const EMOJI: Record<string, string> = { return_by: '🛒', trial_end: '⏳', warranty_until: '🛡️', renewal: '🔁' };

/** Deterministic, always-correct brief. The Boss LLM adds commentary on top; this is also the fallback. */
export async function factualBrief(ctx: SlothContext) {
  const stats = await ctx.hub.call<Stats>('ledger_stats');
  const upcoming = await ctx.hub.call<DeadlineRow[]>('ledger_upcoming', { days: 30 });
  const subs = await ctx.hub.call<SubscriptionRow[]>('ledger_list', { entity: 'subscriptions' });
  const review = await ctx.hub.call<{ merchant: string; item_name: string | null }[]>('ledger_list', { entity: 'items', needs_review: true });
  const week = upcoming.filter((d) => d.due_date <= addDays(7));
  const headline = `🦥 ${week.length} deadline${week.length === 1 ? '' : 's'} this week · ${$(stats.cuttable_monthly)}/mo you can cut · ${stats.pending_actions} draft${stats.pending_actions === 1 ? '' : 's'} ready`;
  const top = upcoming.find((d) => d.type !== 'warranty_until');
  const second = top ? `Most urgent: ${EMOJI[top.type]} ${top.merchant}${top.item_name ? ` ${top.item_name}` : ''} – ${top.type.replace('_', ' ')} ${top.due_date}${top.amount_at_risk ? ` (${$(top.amount_at_risk)} at stake)` : ''}.` : 'Nothing urgent. Go back to sleep. 💤';
  const line = (d: DeadlineRow) => `- ${EMOJI[d.type]} **${d.merchant}**${d.item_name ? ` – ${d.item_name}` : ''}: ${d.type.replace('_', ' ')} **${d.due_date}**${d.amount_at_risk ? ` · ${$(d.amount_at_risk)}` : ''}${d.source === 'llm_guess' ? ' _(AI guess – check)_' : ''}`;
  const flagged = subs.filter((s) => s.status === 'active' && s.flags.length);
  const md = [
    `# 🦥 Refund Sloth – morning brief ${today()}`, '', `**${headline}**`, '', second, '',
    `## ⚠️ Urgent (next 7 days)`, ...(week.length ? week.map(line) : ['- Nothing. Nice.']), '',
    `## 📅 This month`, ...(upcoming.filter((d) => d.due_date > addDays(7)).map(line).concat(upcoming.length > week.length ? [] : ['- Nothing else.'])), '',
    `## 🧟 Subscriptions worth a look`,
    ...(flagged.length ? flagged.map((s) => `- **${s.merchant}** ${$(s.monthly_cost)}/mo – ${s.flags.map((f) => ({ zombie: '🧟 looks unused', duplicate: '👯 overlaps with others', price_increase: `📈 price went up ${$(s.price_change)}` }[f])).join(', ')}`) : ['- All subscriptions look fine.']),
    '', `## 👀 Needs a look`, ...(review.length ? review.map((r) => `- ${r.merchant}${r.item_name ? ` – ${r.item_name}` : ''} (low confidence extraction)`) : ['- Nothing.']),
    '', `## 💰 Scoreboard`, `- Saved so far: **${$(stats.saved_one_time)}** one-time + **${$(stats.saved_monthly)}/mo** (≈ ${$(stats.saved_yearly_total)}/yr)`,
    `- At risk in the next 30 days: **${$(stats.at_risk)}**`, `- Drafts waiting for you: **${stats.pending_actions}** → http://localhost:${ctx.cfg.dashboardPort}`,
  ].join('\n');
  return { headline, second_line: second, markdown: md, stats };
}

const addDays = (n: number) => new Date(Date.parse(today()) + n * 86400000).toISOString().slice(0, 10);

/** Deadlines that end within `urgentDays` (warranties excluded: those are not "act now" money). */
export const pickUrgent = <T extends { type: string; due_date: string }>(rows: T[], todayIso: string, days: number) => {
  const cutoff = new Date(Date.parse(todayIso) + days * 86400000).toISOString().slice(0, 10);
  return rows.filter((d) => d.type !== 'warranty_until' && d.due_date >= todayIso && d.due_date <= cutoff);
};
const daysLeft = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today())) / 86400000);

/** A separate, loud notification for anything ending in the next couple of days. */
async function urgentAlerts(ctx: SlothContext) {
  const upcoming = await ctx.hub.call<DeadlineRow[]>('ledger_upcoming', { days: ctx.cfg.urgentDays });
  const urgent = pickUrgent(upcoming, today(), ctx.cfg.urgentDays);
  if (!urgent.length) return;
  const when = (d: DeadlineRow) => { const n = daysLeft(d.due_date); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
  const first = urgent[0];
  const title = urgent.length === 1 ? `⏰ ${first.merchant} ${first.type === 'return_by' ? 'return window closes' : 'ends'} ${when(first)}` : `⏰ ${urgent.length} things end in the next ${ctx.cfg.urgentDays} days`;
  const message = urgent.slice(0, 3).map((d) => `${EMOJI[d.type]} ${d.merchant} – ${d.type.replace('_', ' ')} ${when(d)}${d.amount_at_risk ? ` (${$(d.amount_at_risk)})` : ''}`).join('\n');
  await ctx.hub.call('notify_send', { title, message, open_url: `http://localhost:${ctx.cfg.dashboardPort}/#today` });
  log('boss', `urgent alert sent for ${urgent.length} deadline(s)`, { ids: urgent.map((d) => d.id) });
}

/** Sloth Boss: reviews the run with read-only MCP tools (agentic loop), then writes the brief. */
export async function boss(ctx: SlothContext, runSummary: Record<string, unknown>) {
  log('boss', 'reviewing the team\'s work…', undefined, 'agent.start');
  const facts = await factualBrief(ctx);
  let take = '';
  try {
    const notes = await runAgent({
      llm: ctx.llm, hub: ctx.hub, agent: 'boss', model: modelFor(ctx.cfg, 'boss'), system: prompt('boss'), maxSteps: 8,
      input: `Today is ${today()}. Run summary: ${JSON.stringify(runSummary)}. Review the ledger and write your notes.`,
      toolNames: ['ledger_stats', 'ledger_upcoming', 'ledger_list'],
    });
    log('boss', `reviewed the ledger with ${notes.toolCalls.length} tool call(s)`);
    const polished = await ctx.llm.chatJSON(Brief, {
      model: modelFor(ctx.cfg, 'boss'), agent: 'boss',
      system: 'You are Sloth Boss 🦥. Turn the notes into a brief. headline: <=120 chars, starts with 🦥, summarizes deadlines this week, $/mo cuttable and drafts ready. second_line: the single most urgent action with date and amount. markdown: 3-6 short bullet points of your take, friendly and calm. Use only numbers from the notes/facts.',
      user: `FACTS (authoritative):\n${facts.headline}\n${facts.second_line}\n\nNOTES:\n${notes.content}`,
    });
    if (polished.ok) take = polished.data.markdown;
  } catch (e) {
    log('boss', `LLM review failed (${(e as Error).message}) - using the factual brief`);
  }
  const markdown = take ? `${facts.markdown}\n\n## 🦥 Sloth Boss's take\n${take}\n` : `${facts.markdown}\n`;
  // Numbers in the headline come from the database, never from the model.
  const brief = { headline: facts.headline, second_line: facts.second_line, markdown };
  const { path } = await ctx.hub.call<{ path: string }>('notify_write_brief', { date: today(), markdown });
  await ctx.hub.call('notify_send', { title: 'Refund Sloth 🦥', message: `${facts.headline.replace('🦥 ', '')}\n${facts.second_line}`, open_url: `http://localhost:${ctx.cfg.dashboardPort}` });
  await urgentAlerts(ctx);
  log('boss', `brief written → ${path}`, { headline: facts.headline }, 'agent.end');
  return brief;
}
