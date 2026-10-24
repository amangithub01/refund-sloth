import { describe, expect, it } from 'vitest';
import { normalizeDate, parseBankCsv, splitMbox } from './parse.ts';
import { safeResolve } from '@sloth/shared';

describe('bank csv', () => {
  it('signed Amount column', () => {
    const t = parseBankCsv('Date,Description,Amount\n2026-10-01,NETFLIX.COM,-15.49\n2026-10-02,PAYROLL,2500\n');
    expect(t).toEqual([{ date: '2026-10-01', description: 'NETFLIX.COM', amount: 15.49 }]);
  });
  it('Debit/Credit columns with US dates', () => {
    const t = parseBankCsv('Posted,Payee,Debit,Credit\n10/03/2026,SPOTIFY USA,11.99,\n10/04/2026,REFUND,,20.00\n');
    expect(t).toEqual([{ date: '2026-10-03', description: 'SPOTIFY USA', amount: 11.99 }]);
  });
  it('Transaction Date / Merchant / Withdrawal', () => {
    const t = parseBankCsv('Transaction Date,Merchant,Withdrawal\n"Oct 5, 2026",PLANET FITNESS,"$24.99"\n');
    expect(t[0]).toEqual({ date: '2026-10-05', description: 'PLANET FITNESS', amount: 24.99 });
  });
  it('rejects unknown headers', () => expect(() => parseBankCsv('a,b\n1,2')).toThrow());
});

describe('misc', () => {
  it('normalizes dates', () => expect(normalizeDate('Nov 4, 2026')).toBe('2026-11-04'));
  it('splits mbox', () => {
    const raw = 'From a@b.com Mon Oct  5 10:00:00 2026\nSubject: one\n\nhello\nFrom c@d.com Tue Oct  6 10:00:00 2026\nSubject: two\n\nbye\n';
    const parts = splitMbox(raw);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toContain('Subject: two');
  });
  it('blocks traversal outside inbox', () => expect(() => safeResolve('/Users/x/RefundSloth/inbox', '../../.ssh/id_rsa')).toThrow());
});
