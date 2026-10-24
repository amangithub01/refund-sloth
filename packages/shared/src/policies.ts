import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './paths.ts';

export interface Policy { returnDays?: number; warrantyMonths?: number; trialDays?: number }
export type PolicyTable = Record<string, Policy>;

export const normalizeMerchant = (s: string): string =>
  s.toLowerCase().replace(/[#*]\S*/g, ' ').replace(/\d+/g, ' ').replace(/[^a-z+& ]/g, ' ').replace(/\s+/g, ' ').trim();

export function loadPolicies(): PolicyTable {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'policies.json'), 'utf8')) as PolicyTable;
}

/** Find the table entry for a merchant (case/punctuation-insensitive, longest key wins). */
export function matchMerchant<T>(merchant: string, table: Record<string, T>, fuzzyMinLen = 0): { key: string; value: T | undefined } {
  const n = ` ${normalizeMerchant(merchant)} `;
  const keys = Object.keys(table).filter((k) => !k.startsWith('_')).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (n.includes(` ${normalizeMerchant(k)} `) || (k.length >= fuzzyMinLen && n.replace(/ /g, '').includes(normalizeMerchant(k).replace(/ /g, '')))) {
      return { key: k, value: table[k] };
    }
  }
  return { key: '_default', value: undefined };
}

/** Find the policy for a merchant (case/punctuation-insensitive, longest key wins). */
export function matchPolicy(merchant: string, table: PolicyTable): { key: string; policy: Policy; matched: boolean } {
  const m = matchMerchant(merchant, table);
  return m.value ? { key: m.key, policy: m.value, matched: true } : { key: '_default', policy: table._default ?? {}, matched: false };
}

/** Where to cancel a subscription / start a return on the store's own website (links.json). */
export interface StoreLinks { cancel?: string; return?: string }
let linksCache: Record<string, StoreLinks> | null = null;
export function loadLinks(): Record<string, StoreLinks> {
  linksCache ??= JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'links.json'), 'utf8')) as Record<string, StoreLinks>;
  return linksCache;
}
export const linksFor = (merchant: string, table = loadLinks()): StoreLinks => matchMerchant(merchant, table, 6).value ?? {};
