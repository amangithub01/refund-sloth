import { afterEach, describe, expect, it } from 'vitest';
import { addMonthsISO, daysUntil, now, today } from './time.ts';
import { linksFor, matchPolicy, normalizeMerchant } from './policies.ts';
import { safeResolve } from './paths.ts';

const table = { amazon: { returnDays: 30 }, 'best buy': { returnDays: 15 }, 'disney+': { trialDays: 0 }, _default: { returnDays: 30 } };

describe('time', () => {
  afterEach(() => { delete process.env.SLOTH_TODAY; });
  it('respects SLOTH_TODAY', () => {
    process.env.SLOTH_TODAY = '2026-10-21';
    expect(today()).toBe('2026-10-21');
    expect(now().getFullYear()).toBe(2026);
    expect(daysUntil('2026-10-24')).toBe(3);
  });
  it('clamps month ends', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('policies', () => {
  it('normalizes merchants', () => expect(normalizeMerchant('BEST BUY #1234')).toBe('best buy'));
  it('matches known merchants', () => {
    expect(matchPolicy('BEST BUY #1234', table).key).toBe('best buy');
    expect(matchPolicy('Amazon.com', table).key).toBe('amazon');
    expect(matchPolicy('Disney+', table).key).toBe('disney+');
  });
  it('falls back to default', () => expect(matchPolicy('Corner Shop', table)).toMatchObject({ key: '_default', matched: false }));
});

describe('paths', () => {
  it('blocks traversal', () => {
    expect(() => safeResolve('/tmp/inbox', '../etc/passwd')).toThrow();
    expect(safeResolve('/tmp/inbox', 'a.png')).toBe('/tmp/inbox/a.png');
  });
});

describe('store links', () => {
  it('finds cancel / return pages from links.json', () => {
    expect(linksFor('NETFLIX.COM 866-579-7172').cancel).toContain('netflix.com/cancelplan');
    expect(linksFor('Peacock Premium').cancel).toContain('peacocktv.com');
    expect(linksFor('Amazon.com').return).toContain('amazon.com');
    expect(linksFor('Apple Music').cancel).toContain('apps.apple.com');
    expect(linksFor('Corner Bakery')).toEqual({});
    expect(linksFor('Maxwell Hardware')).toEqual({});
    expect(linksFor('HBO Max').cancel).toContain('max.com');
  });
});
