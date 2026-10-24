import { describe, expect, it } from 'vitest';
import { buildSearch, emlName, providerHost } from './mail.ts';

describe('mail sync helpers', () => {
  it('picks the IMAP host from the address', () => {
    expect(providerHost('me@gmail.com')).toBe('imap.gmail.com');
    expect(providerHost('me@Outlook.com')).toBe('outlook.office365.com');
    expect(providerHost('me@icloud.com')).toBe('imap.mail.me.com');
    expect(providerHost('me@fastmail.com')).toBe('imap.fastmail.com');
  });
  it('uses one Gmail raw query, and SINCE + OR(subject) elsewhere', () => {
    const g = buildSearch('imap.gmail.com', 30);
    expect(g.gmailraw).toMatch(/^newer_than:30d /);
    expect(g.gmailraw).toContain('subject:trial');
    const o = buildSearch('imap.mail.me.com', 10, new Date('2026-10-21T00:00:00Z'));
    expect((o.since as Date).toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(o.or?.some((x) => x.subject === 'receipt')).toBe(true);
  });
  it('names files stably so the same email is never fetched twice', () => {
    const d = new Date('2026-10-16T10:00:00Z');
    expect(emlName('<a@b>', d)).toBe(emlName('<a@b>', d));
    expect(emlName('<a@b>', d)).not.toBe(emlName('<c@b>', d));
    expect(emlName('<a@b>', d)).toMatch(/^mail_2026-10-16_[0-9a-f]{10}\.eml$/);
  });
});
