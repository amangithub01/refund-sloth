import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Ledger } from './ledger.ts';

let ledger: Ledger;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-ledger-'));
beforeAll(() => { process.env.SLOTH_TODAY = '2026-10-21'; ledger = new Ledger(path.join(dir, 't.db')); });
afterAll(() => { ledger.close(); fs.rmSync(dir, { recursive: true, force: true }); delete process.env.SLOTH_TODAY; });

const item = {
  merchant: 'Best Buy', item_name: 'Headphones', order_number: 'BBY01', amount: 348, currency: 'USD', purchase_date: '2026-10-12',
  kind: 'purchase' as const, trial_end_date: null, return_by_date: null, next_charge_date: null, warranty_months: null, merchant_email: null, policy_text: null, confidence: 0.9,
};

describe('Ledger', () => {
  it('dedupes files by hash', () => {
    const a = ledger.registerFile('/x/a.png', 'abc', 'receipt_image');
    ledger.markFile(a.file_id, 'processed');
    expect(ledger.registerFile('/x/a.png', 'abc', 'receipt_image')).toEqual({ file_id: a.file_id, already_seen: true });
  });
  it('upserts deadlines uniquely per item+type', () => {
    const { item_id } = ledger.saveItem(null, item, false);
    expect(ledger.saveItem(null, item, false)).toEqual({ item_id, duplicate: true });
    const d1 = ledger.addDeadline({ item_id, type: 'return_by', due_date: '2026-10-27', amount_at_risk: 348, source: 'policy', confidence: 0.8 });
    const d2 = ledger.addDeadline({ item_id, type: 'return_by', due_date: '2026-10-28', amount_at_risk: 348, source: 'document', confidence: 0.95 });
    expect(d2.deadline_id).toBe(d1.deadline_id);
    expect(ledger.upcoming(30)).toHaveLength(1);
  });
  it('approving an action records savings and closes the deadline', () => {
    const [d] = ledger.upcoming(30);
    const { action_id } = ledger.queueAction({ deadline_id: d!.id, type: 'return_email', title: 'Return headphones', body: 'x'.repeat(50), potential_saving: 348 });
    expect(ledger.queueAction({ deadline_id: d!.id, type: 'return_email', title: 'dup', body: 'x'.repeat(50), potential_saving: 1 }).skipped).toBe(true);
    ledger.decideAction(action_id, 'approved');
    const s = ledger.stats();
    expect(s.saved_one_time).toBe(348);
    expect(ledger.upcoming(30)).toHaveLength(0);
  });
  it('cancelling a subscription counts monthly savings', () => {
    const { subscription_id } = ledger.upsertSubscription({
      merchant: 'Planet Fitness', normalized_name: 'PLANET FITNESS', monthly_cost: 24.99, cadence: 'monthly', first_seen: '2026-07-01',
      last_charged: '2026-10-01', charge_count: 4, last_amount: 24.99, price_change: 0, flags: ['zombie'], category: 'fitness', reason: 'unused',
    });
    expect(ledger.stats().zombies).toBe(1);
    const { action_id } = ledger.queueAction({ subscription_id, type: 'cancel_email', title: 'Cancel PF', body: 'y'.repeat(50), potential_saving: 24.99 });
    ledger.decideAction(action_id, 'approved');
    const s = ledger.stats();
    expect(s.saved_monthly).toBe(24.99);
    expect(s.saved_yearly_total).toBeCloseTo(348 + 24.99 * 12);
    expect(ledger.getSubscription(subscription_id)!.status).toBe('cancelled');
  });
});
