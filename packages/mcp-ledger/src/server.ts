import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ActionType, DeadlineSource, DeadlineType, ExtractedItem, FileKind, SubFlag } from '@sloth/shared';
import { Ledger } from './ledger.ts';

const ledger = new Ledger();
const server = new McpServer({ name: 'sloth-ledger', version: '0.1.0' });
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

server.registerTool('ledger_register_file', {
  description: 'Register an inbox file by hash. Returns already_seen=true if it was processed before.',
  inputSchema: { path: z.string(), sha256: z.string(), kind: FileKind },
}, async (a) => ok(ledger.registerFile(a.path, a.sha256, a.kind)));

server.registerTool('ledger_mark_file', {
  description: 'Mark a file processed/failed/skipped.',
  inputSchema: { file_id: z.string(), status: z.enum(['processed', 'failed', 'skipped']), error: z.string().optional() },
}, async (a) => ok(ledger.markFile(a.file_id, a.status, a.error)));

server.registerTool('ledger_save_item', {
  description: 'Save an extracted purchase/trial/subscription item.',
  inputSchema: { file_id: z.string().nullable(), item: ExtractedItem, needs_review: z.boolean() },
}, async (a) => ok(ledger.saveItem(a.file_id, a.item, a.needs_review)));

server.registerTool('ledger_add_deadline', {
  description: 'Add or update a deadline (trial_end, return_by, warranty_until, renewal) for an item or subscription.',
  inputSchema: {
    item_id: z.string().nullable().optional(), subscription_id: z.string().nullable().optional(), type: DeadlineType,
    due_date: z.string(), amount_at_risk: z.number().nullable().optional(), source: DeadlineSource, confidence: z.number(),
  },
}, async (a) => ok(ledger.addDeadline(a)));

server.registerTool('ledger_set_deadline_ics', {
  description: 'Attach a generated .ics reminder path to a deadline.',
  inputSchema: { deadline_id: z.string(), ics_path: z.string() },
}, async (a) => ok(ledger.setDeadlineIcs(a.deadline_id, a.ics_path)));

server.registerTool('ledger_upsert_subscription', {
  description: 'Insert or update a recurring subscription detected from bank charges.',
  inputSchema: {
    merchant: z.string(), normalized_name: z.string(), monthly_cost: z.number(), cadence: z.enum(['weekly', 'monthly', 'yearly']),
    first_seen: z.string(), last_charged: z.string(), charge_count: z.number().int(), last_amount: z.number(), price_change: z.number(),
    flags: z.array(SubFlag), category: z.string(), reason: z.string(),
  },
}, async (a) => ok(ledger.upsertSubscription(a)));

server.registerTool('ledger_queue_action', {
  description: 'Queue a drafted action (email or review) for human approval. Never sends anything.',
  inputSchema: {
    deadline_id: z.string().nullable().optional(), subscription_id: z.string().nullable().optional(), type: ActionType, title: z.string(),
    to_address: z.string().nullable().optional(), subject: z.string().nullable().optional(), body: z.string(), potential_saving: z.number(),
    saving_period: z.enum(['one_time', 'monthly']).optional(),
  },
}, async (a) => ok(ledger.queueAction(a)));

server.registerTool('ledger_has_action', {
  description: 'Check whether an action was ever queued for a deadline or subscription (any status).',
  inputSchema: { deadline_id: z.string().nullable().optional(), subscription_id: z.string().nullable().optional() },
}, async (a) => ok({ exists: ledger.hasActionFor(a) }));

server.registerTool('ledger_list', {
  description: 'List rows of an entity: items, deadlines, subscriptions, actions, files, savings.',
  inputSchema: {
    entity: z.enum(['items', 'deadlines', 'subscriptions', 'actions', 'files', 'savings']),
    status: z.string().optional(), limit: z.number().int().optional(), needs_review: z.boolean().optional(),
  },
}, async (a) => ok(ledger.list(a.entity, a)));

server.registerTool('ledger_upcoming', {
  description: 'Open deadlines due within N days, with merchant and amounts.',
  inputSchema: { days: z.number().int() },
}, async (a) => ok(ledger.upcoming(a.days)));

server.registerTool('ledger_stats', {
  description: 'Money saved, money at risk, open deadlines, pending actions, zombie subscriptions.',
  inputSchema: {},
}, async () => ok(ledger.stats()));

server.registerTool('ledger_decide_action', {
  description: 'Record the human decision on a queued action.',
  inputSchema: { action_id: z.string(), decision: z.enum(['approved', 'snoozed', 'dismissed']), snooze_days: z.number().int().optional() },
}, async (a) => ok(ledger.decideAction(a.action_id, a.decision, a.snooze_days)));

server.registerTool('ledger_record_run', {
  description: 'Record a pipeline run status.',
  inputSchema: { run_id: z.string(), status: z.string(), files_processed: z.number().int().optional(), brief: z.string().optional(), log_json: z.string().optional() },
}, async (a) => ok(ledger.recordRun(a)));

ledger.expirePast();
await server.connect(new StdioServerTransport());
console.error('[sloth-ledger] ready');
