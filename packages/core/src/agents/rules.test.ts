import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseBankCsv } from '@sloth/mcp-docs';
import type { ExtractedItem, PolicyTable } from '@sloth/shared';
import { applyFlagRules, fallbackCategory, findRecurring, normalizeDescription } from './auditor.ts';
import { computeDeadlines } from './deadlineHawk.ts';

beforeAll(() => { process.env.SLOTH_TODAY = '2026-10-21'; });
afterAll(() => { delete process.env.SLOTH_TODAY; });

const policies: PolicyTable = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../../policies.json'), 'utf8'));
const base: ExtractedItem = {
  merchant: 'Best Buy', item_name: 'Headphones', order_number: null, amount: 348, currency: 'USD', purchase_date: '2026-10-12', kind: 'purchase',
  trial_end_date: null, return_by_date: null, next_charge_date: null, warranty_months: null, merchant_email: null, policy_text: null, confidence: 0.9,
};

describe('Deadline Hawk rules', () => {
  it('uses policy table', () => {
    const d = computeDeadlines(base, policies);
    expect(d).toEqual([
      expect.objectContaining({ type: 'return_by', due_date: '2026-10-27', source: 'policy' }),
      expect.objectContaining({ type: 'warranty_until', due_date: '2027-10-12', source: 'policy' }),
    ]);
  });
  it('document beats policy', () => {
    const d = computeDeadlines({ ...base, merchant: 'Amazon', return_by_date: '2026-11-04' }, policies);
    expect(d[0]).toMatchObject({ type: 'return_by', due_date: '2026-11-04', source: 'document' });
  });
  it('no warranty under $50, past return windows dropped', () => {
    const d = computeDeadlines({ ...base, amount: 20, purchase_date: '2026-09-01' }, policies);
    expect(d).toEqual([]);
  });
  it('unknown merchant uses LLM guess with low confidence', () => {
    const d = computeDeadlines({ ...base, merchant: 'Corner Gadgets' }, policies, { returnDays: 14, warrantyMonths: null, trialDays: null });
    expect(d[0]).toMatchObject({ type: 'return_by', due_date: '2026-10-26', source: 'llm_guess' });
    expect(d[0]!.confidence).toBeLessThan(0.5);
  });
  it('trials use policy trialDays', () => {
    const d = computeDeadlines({ ...base, merchant: 'Audible', kind: 'trial', amount: 14.95, purchase_date: '2026-10-01' }, policies);
    expect(d).toEqual([expect.objectContaining({ type: 'trial_end', due_date: '2026-10-31', amount_at_risk: 14.95 })]);
  });
});

describe('Subscription Auditor rules', () => {
  it('normalizes descriptions', () => {
    expect(normalizeDescription('NETFLIX.COM 866-579-7172 CA')).toBe('NETFLIX');
    expect(normalizeDescription('PLANET FIT CLUB #1234 BOSTON MA')).toBe('PLANET FIT CLUB');
    expect(normalizeDescription('DROPBOX*7HX2K DROPBOX.COM CA')).toBe('DROPBOX');
    expect(normalizeDescription('APPLE.COM/BILL APPLE MUSIC 866-712-7753 CA')).toBe('APPLE MUSIC');
    expect(normalizeDescription('NYTIMES *NYTDIGITAL')).toBe('NYTIMES NYTDIGITAL');
  });
  it('finds the fixture subscriptions and no noise', () => {
    const txns = parseBankCsv(fs.readFileSync(path.join(import.meta.dirname, '../../../../eval/fixtures/bank_statement.csv'), 'utf8'));
    const subs = findRecurring(txns, '2026-10-21');
    const names = subs.map((s) => s.normalized_name).sort();
    expect(names).toEqual(['ADOBE CREATIVE CLD', 'AI TOOL PRO', 'APPLE ICLOUD', 'APPLE MUSIC', 'DISNEY PLUS', 'DROPBOX', 'HULU', 'MAX', 'NETFLIX', 'NYTIMES NYTDIGITAL', 'PLANET FIT CLUB', 'SPOTIFY'].sort());
    expect(subs.find((s) => s.normalized_name === 'NYTIMES NYTDIGITAL')!.flags).toEqual(['price_increase']);
    expect(subs.find((s) => s.normalized_name === 'ADOBE CREATIVE CLD')).toMatchObject({ cadence: 'yearly', monthly_cost: 19.99 });
  });
  it('flags duplicates and zombies', () => {
    const mk = (merchant: string) => ({ normalized_name: merchant.toUpperCase(), merchant, category: fallbackCategory(merchant.toUpperCase()), flags: [] as ('zombie' | 'duplicate' | 'price_increase')[] });
    const subs = applyFlagRules([mk('Spotify'), mk('Apple Music'), mk('Planet Fitness'), mk('The New York Times'), mk('Dropbox')], (m) => /times/i.test(m));
    const f = Object.fromEntries(subs.map((s) => [s.merchant, s.flags]));
    expect(f['Spotify']).toEqual(['duplicate']);
    expect(f['Planet Fitness']).toEqual(['zombie']);
    expect(f['The New York Times']).toEqual([]);
    expect(f['Dropbox']).toEqual([]);
  });
});
