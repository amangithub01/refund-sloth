import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { nanoid } from 'nanoid';
import {
  addDaysISO, dataPaths, nowStamp, today,
  type ActionType, type DeadlineSource, type DeadlineType, type ExtractedItem, type FileKind, type SubFlag,
} from '@sloth/shared';

const MIGRATIONS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations.sql'), 'utf8');

type Row = Record<string, unknown>;
const id = (prefix: string) => `${prefix}_${nanoid(10)}`;

export interface SubscriptionInput {
  merchant: string; normalized_name: string; monthly_cost: number; cadence: 'weekly' | 'monthly' | 'yearly';
  first_seen: string; last_charged: string; charge_count: number; last_amount: number; price_change: number;
  flags: SubFlag[]; category: string; reason: string;
}

export interface ItemRow {
  id: string; file_id: string | null; merchant: string; item_name: string | null; order_number: string | null; amount: number | null;
  currency: string | null; purchase_date: string | null; kind: ExtractedItem['kind']; merchant_email: string | null; policy_text: string | null;
  confidence: number; needs_review: number; raw_json: string; created_at: string;
}

export interface DeadlineRow {
  id: string; item_id: string | null; subscription_id: string | null; type: DeadlineType; due_date: string;
  amount_at_risk: number | null; source: DeadlineSource; confidence: number; status: string; ics_path: string | null; created_at: string;
  item_merchant: string | null; item_name: string | null; order_number: string | null; item_amount: number | null; purchase_date: string | null;
  merchant_email: string | null; needs_review: number | null; sub_merchant: string | null; monthly_cost: number | null; merchant: string;
}

export interface SubscriptionRow {
  id: string; merchant: string; normalized_name: string; monthly_cost: number; cadence: string; first_seen: string; last_charged: string;
  charge_count: number; last_amount: number | null; price_change: number; flags: SubFlag[]; category: string | null; reason: string | null;
  unused: number; status: 'active' | 'cancelled' | 'keep';
}

export interface ActionRow {
  id: string; deadline_id: string | null; subscription_id: string | null; type: ActionType; title: string; to_address: string | null;
  subject: string | null; body: string; potential_saving: number; saving_period: 'one_time' | 'monthly'; status: string;
  snooze_until: string | null; created_at: string; decided_at: string | null; merchant: string | null; due_date: string | null; deadline_type: string | null;
}

export interface Stats {
  saved_one_time: number; saved_monthly: number; saved_yearly_total: number; at_risk: number;
  open_deadlines: number; urgent_deadlines: number; pending_actions: number; zombies: number;
  monthly_subscriptions: number; cuttable_monthly: number; needs_review: number;
}

export class Ledger {
  readonly db: DatabaseSync;

  constructor(dbPath = dataPaths().db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(MIGRATIONS);
  }

  close() { this.db.close(); }

  private all<T = Row>(sql: string, ...p: (string | number | null)[]): T[] { return this.db.prepare(sql).all(...p) as T[]; }
  private get<T = Row>(sql: string, ...p: (string | number | null)[]): T | undefined { return this.db.prepare(sql).get(...p) as T | undefined; }
  private run(sql: string, ...p: (string | number | null)[]) { return this.db.prepare(sql).run(...p); }

  // ---- files ----
  registerFile(filePath: string, sha256: string, kind: FileKind): { file_id: string; already_seen: boolean } {
    const existing = this.get<{ id: string; status: string }>('SELECT id, status FROM files WHERE sha256 = ?', sha256);
    if (existing) {
      const retry = existing.status === 'new' || existing.status === 'failed';
      return { file_id: existing.id, already_seen: !retry };
    }
    const fid = id('file');
    this.run('INSERT INTO files (id, path, sha256, kind, created_at) VALUES (?,?,?,?,?)', fid, filePath, sha256, kind, nowStamp());
    return { file_id: fid, already_seen: false };
  }

  markFile(fileId: string, status: 'processed' | 'failed' | 'skipped', error?: string) {
    this.run('UPDATE files SET status = ?, error = ?, processed_at = ? WHERE id = ?', status, error ?? null, nowStamp(), fileId);
    return { ok: true };
  }

  // ---- items ----
  saveItem(fileId: string | null, item: ExtractedItem, needsReview: boolean): { item_id: string; duplicate: boolean } {
    if (item.order_number) {
      const dup = this.get<{ id: string }>('SELECT id FROM items WHERE order_number = ? AND lower(merchant) = lower(?)', item.order_number, item.merchant);
      if (dup) return { item_id: dup.id, duplicate: true };
    }
    const iid = id('item');
    this.run(
      `INSERT INTO items (id, file_id, merchant, item_name, order_number, amount, currency, purchase_date, kind,
        merchant_email, policy_text, confidence, needs_review, raw_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      iid, fileId, item.merchant, item.item_name, item.order_number, item.amount, item.currency, item.purchase_date, item.kind,
      item.merchant_email, item.policy_text, item.confidence, needsReview ? 1 : 0, JSON.stringify(item), nowStamp(),
    );
    return { item_id: iid, duplicate: false };
  }

  getItem(itemId: string) { return this.get<ItemRow>('SELECT * FROM items WHERE id = ?', itemId); }

  updateItem(itemId: string, patch: Partial<Pick<ExtractedItem, 'merchant' | 'item_name' | 'amount' | 'purchase_date' | 'kind' | 'order_number'>>) {
    const fields = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (!fields.length) return { ok: true };
    const sets = fields.map(([k]) => `${k} = ?`).join(', ');
    this.run(`UPDATE items SET ${sets}, needs_review = 0 WHERE id = ?`, ...fields.map(([, v]) => v as string | number | null), itemId);
    return { ok: true };
  }

  mentionedMerchantSince(merchantNorm: string, sinceISO: string): boolean {
    const rows = this.all<{ merchant: string }>('SELECT merchant FROM items WHERE purchase_date >= ?', sinceISO);
    return rows.some((r) => r.merchant.toLowerCase().replace(/[^a-z]/g, '').includes(merchantNorm.toLowerCase().replace(/[^a-z]/g, '')));
  }

  // ---- deadlines ----
  addDeadline(d: {
    item_id?: string | null; subscription_id?: string | null; type: DeadlineType; due_date: string;
    amount_at_risk?: number | null; source: DeadlineSource; confidence: number;
  }): { deadline_id: string; created: boolean } {
    const col = d.item_id ? 'item_id' : 'subscription_id';
    const ref = (d.item_id ?? d.subscription_id) as string;
    const existing = this.get<{ id: string; source: string }>(`SELECT id, source FROM deadlines WHERE ${col} = ? AND type = ?`, ref, d.type);
    const status = d.due_date < today() && d.type !== 'warranty_until' ? 'expired' : 'open';
    if (existing) {
      this.run('UPDATE deadlines SET due_date = ?, amount_at_risk = ?, source = ?, confidence = ? WHERE id = ?',
        d.due_date, d.amount_at_risk ?? null, d.source, d.confidence, existing.id);
      return { deadline_id: existing.id, created: false };
    }
    const did = id('dl');
    this.run(
      `INSERT INTO deadlines (id, item_id, subscription_id, type, due_date, amount_at_risk, source, confidence, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      did, d.item_id ?? null, d.subscription_id ?? null, d.type, d.due_date, d.amount_at_risk ?? null, d.source, d.confidence, status, nowStamp(),
    );
    return { deadline_id: did, created: true };
  }

  setDeadlineIcs(deadlineId: string, icsPath: string) { this.run('UPDATE deadlines SET ics_path = ? WHERE id = ?', icsPath, deadlineId); return { ok: true }; }
  setDeadlineStatus(deadlineId: string, status: 'open' | 'done' | 'dismissed') { this.run('UPDATE deadlines SET status = ? WHERE id = ?', status, deadlineId); return { ok: true }; }

  expirePast(): number {
    const r = this.run("UPDATE deadlines SET status = 'expired' WHERE status = 'open' AND due_date < ? AND type != 'warranty_until'", today());
    return Number(r.changes);
  }

  deadlines(opts: { status?: string; days?: number } = {}) {
    const where: string[] = [];
    const p: (string | number)[] = [];
    if (opts.status) { where.push('d.status = ?'); p.push(opts.status); }
    if (opts.days !== undefined) { where.push('d.due_date <= ?'); p.push(addDaysISO(today(), opts.days)); }
    return this.all<Omit<DeadlineRow, 'merchant'>>(
      `SELECT d.*, i.merchant AS item_merchant, i.item_name, i.order_number, i.amount AS item_amount, i.purchase_date,
              i.merchant_email, i.needs_review, s.merchant AS sub_merchant, s.monthly_cost
         FROM deadlines d LEFT JOIN items i ON i.id = d.item_id LEFT JOIN subscriptions s ON s.id = d.subscription_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.due_date ASC`, ...p,
    ).map((r): DeadlineRow => ({ ...r, merchant: r.item_merchant ?? r.sub_merchant ?? 'Unknown' }));
  }

  upcoming(days: number) { return this.deadlines({ status: 'open', days }).filter((d) => d.due_date >= today()); }

  // ---- subscriptions ----
  upsertSubscription(s: SubscriptionInput): { subscription_id: string } {
    const existing = this.get<{ id: string; flags: string; unused: number }>('SELECT id, flags, unused FROM subscriptions WHERE normalized_name = ?', s.normalized_name);
    if (existing) {
      const flags = new Set<string>([...s.flags]);
      if (existing.unused) flags.add('zombie');
      this.run(
        `UPDATE subscriptions SET merchant=?, monthly_cost=?, cadence=?, first_seen=min(first_seen, ?), last_charged=?, charge_count=?,
           last_amount=?, price_change=?, flags=?, category=?, reason=? WHERE id = ?`,
        s.merchant, s.monthly_cost, s.cadence, s.first_seen, s.last_charged, s.charge_count, s.last_amount, s.price_change,
        JSON.stringify([...flags]), s.category, s.reason, existing.id,
      );
      return { subscription_id: existing.id };
    }
    const sid = id('sub');
    this.run(
      `INSERT INTO subscriptions (id, merchant, normalized_name, monthly_cost, cadence, first_seen, last_charged, charge_count,
         last_amount, price_change, flags, category, reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      sid, s.merchant, s.normalized_name, s.monthly_cost, s.cadence, s.first_seen, s.last_charged, s.charge_count,
      s.last_amount, s.price_change, JSON.stringify(s.flags), s.category, s.reason,
    );
    return { subscription_id: sid };
  }

  subscriptions(): SubscriptionRow[] {
    return this.all<Omit<SubscriptionRow, 'flags'> & { flags: string }>('SELECT * FROM subscriptions ORDER BY monthly_cost DESC')
      .map((r) => ({ ...r, flags: JSON.parse(r.flags) as SubFlag[] }));
  }
  getSubscription(subId: string): SubscriptionRow | undefined {
    const r = this.get<Omit<SubscriptionRow, 'flags'> & { flags: string }>('SELECT * FROM subscriptions WHERE id = ?', subId);
    return r ? { ...r, flags: JSON.parse(r.flags) as SubFlag[] } : undefined;
  }

  updateSubscription(subId: string, patch: { status?: 'active' | 'cancelled' | 'keep'; unused?: boolean }) {
    const sub = this.getSubscription(subId);
    if (!sub) throw new Error(`No subscription ${subId}`);
    const flags = new Set<string>(sub.flags);
    if (patch.unused === true) flags.add('zombie');
    if (patch.unused === false || patch.status === 'keep') flags.delete('zombie');
    this.run('UPDATE subscriptions SET status = coalesce(?, status), unused = coalesce(?, unused), flags = ? WHERE id = ?',
      patch.status ?? null, patch.unused === undefined ? null : patch.unused ? 1 : 0, JSON.stringify([...flags]), subId);
    return { ok: true };
  }

  // ---- actions ----
  queueAction(a: {
    deadline_id?: string | null; subscription_id?: string | null; type: ActionType; title: string;
    to_address?: string | null; subject?: string | null; body: string; potential_saving: number; saving_period?: 'one_time' | 'monthly';
  }): { action_id: string; skipped: boolean } {
    const col = a.deadline_id ? 'deadline_id' : 'subscription_id';
    const ref = (a.deadline_id ?? a.subscription_id) as string;
    const existing = this.get<{ id: string }>(`SELECT id FROM actions WHERE ${col} = ? AND type = ?`, ref, a.type);
    if (existing) return { action_id: existing.id, skipped: true };
    const aid = id('act');
    this.run(
      `INSERT INTO actions (id, deadline_id, subscription_id, type, title, to_address, subject, body, potential_saving, saving_period, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      aid, a.deadline_id ?? null, a.subscription_id ?? null, a.type, a.title, a.to_address ?? null, a.subject ?? null, a.body,
      a.potential_saving, a.saving_period ?? (a.type === 'cancel_email' ? 'monthly' : 'one_time'), nowStamp(),
    );
    return { action_id: aid, skipped: false };
  }

  /** True if any action (in any status, incl. dismissed) exists for the target, so we never re-nag. */
  hasActionFor(target: { deadline_id?: string | null; subscription_id?: string | null }): boolean {
    const col = target.deadline_id ? 'deadline_id' : 'subscription_id';
    return !!this.get(`SELECT 1 FROM actions WHERE ${col} = ?`, (target.deadline_id ?? target.subscription_id) as string);
  }

  actions(status?: string) {
    // Snoozed actions whose snooze has elapsed come back as pending.
    this.run("UPDATE actions SET status = 'pending', snooze_until = NULL WHERE status = 'snoozed' AND snooze_until <= ?", today());
    return this.all<ActionRow>(
      `SELECT a.*, coalesce(i.merchant, s.merchant) AS merchant, d.due_date, d.type AS deadline_type
         FROM actions a LEFT JOIN deadlines d ON d.id = a.deadline_id LEFT JOIN items i ON i.id = d.item_id
         LEFT JOIN subscriptions s ON s.id = a.subscription_id
        ${status ? 'WHERE a.status = ?' : ''} ORDER BY coalesce(d.due_date, '9999') ASC, a.created_at ASC`,
      ...(status ? [status] : []),
    );
  }

  updateActionDraft(actionId: string, patch: { subject?: string; body?: string; to_address?: string | null }) {
    this.run('UPDATE actions SET subject = coalesce(?, subject), body = coalesce(?, body), to_address = coalesce(?, to_address) WHERE id = ?',
      patch.subject ?? null, patch.body ?? null, patch.to_address ?? null, actionId);
    return { ok: true };
  }

  decideAction(actionId: string, decision: 'approved' | 'snoozed' | 'dismissed', snoozeDays = 3) {
    const a = this.get<{ id: string; status: string; type: string; deadline_id: string | null; subscription_id: string | null; potential_saving: number; saving_period: 'one_time' | 'monthly'; title: string }>(
      'SELECT * FROM actions WHERE id = ?', actionId);
    if (!a) throw new Error(`No action ${actionId}`);
    if (a.status === 'approved') return { ok: true, already: true };
    this.db.exec('BEGIN');
    try {
      this.run('UPDATE actions SET status = ?, snooze_until = ?, decided_at = ? WHERE id = ?',
        decision, decision === 'snoozed' ? addDaysISO(today(), snoozeDays) : null, nowStamp(), actionId);
      if (decision === 'approved') {
        if (a.type !== 'review' && a.potential_saving > 0) {
          this.run('INSERT INTO savings (id, action_id, amount, period, note, created_at) VALUES (?,?,?,?,?,?)',
            id('sav'), actionId, a.potential_saving, a.saving_period, a.title, nowStamp());
        }
        if (a.deadline_id) this.run("UPDATE deadlines SET status = 'done' WHERE id = ?", a.deadline_id);
        if (a.subscription_id && a.type === 'cancel_email') this.run("UPDATE subscriptions SET status = 'cancelled' WHERE id = ?", a.subscription_id);
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  }

  // ---- items list / misc ----
  list(entity: 'items' | 'deadlines' | 'subscriptions' | 'actions' | 'files' | 'savings', opts: { status?: string; limit?: number; needs_review?: boolean } = {}) {
    const limit = opts.limit ?? 200;
    if (entity === 'deadlines') return this.deadlines({ status: opts.status }).slice(0, limit);
    if (entity === 'subscriptions') return this.subscriptions().slice(0, limit);
    if (entity === 'actions') return this.actions(opts.status).slice(0, limit);
    if (entity === 'items' && opts.needs_review) return this.all('SELECT * FROM items WHERE needs_review = 1 ORDER BY created_at DESC LIMIT ?', limit);
    if (opts.status && entity === 'files') return this.all('SELECT * FROM files WHERE status = ? ORDER BY created_at DESC LIMIT ?', opts.status, limit);
    return this.all(`SELECT * FROM ${entity} ORDER BY created_at DESC LIMIT ?`, limit);
  }

  stats(): Stats {
    const n = (sql: string, ...p: (string | number)[]) => Number((this.get<{ v: number | null }>(sql, ...p)?.v) ?? 0);
    const horizon = addDaysISO(today(), 30);
    const saved_one_time = n("SELECT sum(amount) v FROM savings WHERE period = 'one_time'");
    const saved_monthly = n("SELECT sum(amount) v FROM savings WHERE period = 'monthly'");
    const flagged = this.subscriptions().filter((s) => s.status === 'active' && s.flags.length > 0);
    // Cuttable = every zombie + one (the priciest) per duplicate category – you'd keep the rest.
    const cut = new Map<string, SubscriptionRow>();
    for (const s of flagged) {
      if (s.flags.includes('zombie')) cut.set(s.id, s);
      else if (s.flags.includes('duplicate')) {
        const key = `dup:${s.category}`;
        const cur = cut.get(key);
        if (!cur || Number(s.monthly_cost) > Number(cur.monthly_cost)) cut.set(key, s);
      }
    }
    const cuttable_monthly = [...cut.values()].reduce((t, s) => t + Number(s.monthly_cost), 0);
    const deadlineRisk = n(
      "SELECT sum(amount_at_risk) v FROM deadlines WHERE status = 'open' AND type IN ('trial_end','return_by','renewal') AND due_date >= ? AND due_date <= ?", today(), horizon);
    return {
      saved_one_time: round(saved_one_time), saved_monthly: round(saved_monthly), saved_yearly_total: round(saved_one_time + saved_monthly * 12),
      at_risk: round(deadlineRisk + cuttable_monthly),
      open_deadlines: n("SELECT count(*) v FROM deadlines WHERE status = 'open' AND due_date >= ?", today()),
      urgent_deadlines: n("SELECT count(*) v FROM deadlines WHERE status = 'open' AND due_date >= ? AND due_date <= ?", today(), addDaysISO(today(), 7)),
      pending_actions: n("SELECT count(*) v FROM actions WHERE status = 'pending'"),
      zombies: flagged.filter((s) => s.flags.includes('zombie')).length,
      monthly_subscriptions: round(this.subscriptions().filter((s) => s.status !== 'cancelled').reduce((t, s) => t + Number(s.monthly_cost), 0)),
      cuttable_monthly: round(cuttable_monthly),
      needs_review: n('SELECT count(*) v FROM items WHERE needs_review = 1'),
    };
  }

  savingsTimeline() {
    return this.all<{ day: string; amount: number; period: string }>("SELECT substr(created_at,1,10) day, amount, period FROM savings ORDER BY created_at");
  }

  // ---- runs ----
  recordRun(r: { run_id: string; status: string; files_processed?: number; brief?: string; log_json?: string }) {
    const exists = this.get('SELECT 1 FROM runs WHERE id = ?', r.run_id);
    if (!exists) {
      this.run('INSERT INTO runs (id, started_at, status) VALUES (?,?,?)', r.run_id, nowStamp(), r.status);
    } else {
      this.run('UPDATE runs SET status = ?, finished_at = ?, files_processed = coalesce(?, files_processed), brief = coalesce(?, brief), log_json = coalesce(?, log_json) WHERE id = ?',
        r.status, nowStamp(), r.files_processed ?? null, r.brief ?? null, r.log_json ?? null, r.run_id);
    }
    return { ok: true };
  }
  runs(limit = 10) { return this.all('SELECT id, started_at, finished_at, status, files_processed, brief FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?', limit); }
  latestBrief() { return this.get<{ brief: string; finished_at: string }>("SELECT brief, finished_at FROM runs WHERE brief IS NOT NULL ORDER BY started_at DESC, rowid DESC LIMIT 1"); }
}

const round = (x: number) => Math.round(x * 100) / 100;
