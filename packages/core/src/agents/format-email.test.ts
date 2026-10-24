import { describe, expect, it } from 'vitest';
import { formatEmail } from './format-email.ts';

const user = { name: 'Priya', email: 'priya@example.com' };

describe('formatEmail', () => {
  it('splits a one-line email into greeting, paragraphs and sign-off, dropping "today is"', () => {
    const raw = 'Hello Dell Support Team, I am writing to request a full refund for my Dell XPS 14 Laptop (Order #7781234). The item does not meet my expectations. As today is October 21, 2026, I am writing well within your 30-day return window, which closes on October 25, 2026. Please confirm receipt of this request. Thank you for your prompt assistance in resolving this matter. Best regards, Priya priya@example.com';
    const out = formatEmail(raw, user);
    expect(out.startsWith('Hello Dell Support Team,\n\n')).toBe(true);
    expect(out).not.toMatch(/today/i);
    expect(out).not.toMatch(/Best regards/);
    expect(out).toContain('Order #7781234');
    expect(out.endsWith('\n\nThank you,\nPriya\npriya@example.com')).toBe(true);
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(4);
  });

  it('adds a sign-off when the model forgot one', () => {
    const out = formatEmail('Hello Adobe Support, I want to cancel my trial. Please confirm no charges apply.', user);
    expect(out).toBe('Hello Adobe Support,\n\nI want to cancel my trial. Please confirm no charges apply.\n\nThank you,\nPriya\npriya@example.com');
  });

  it('does not split on decimal points', () => {
    const out = formatEmail('Hello Adobe, The plan converts to $59.99 on Oct 25. Please cancel it. Thanks, Priya', user);
    expect(out).toContain('$59.99 on Oct 25.');
  });

  it('uses the known merchant in the greeting', () => {
    expect(formatEmail('Hello Adobe Support, Please cancel AI Tool Pro.', user, 'AI Tool Pro').split('\n')[0]).toBe('Hello AI Tool Pro team,');
  });

  it('keeps already-formatted emails intact', () => {
    const out = formatEmail('Hi Hulu,\n\nPlease cancel my plan.\n\nThank you,\nPriya\npriya@example.com', user);
    expect(out).toBe('Hi Hulu,\n\nPlease cancel my plan.\n\nThank you,\nPriya\npriya@example.com');
  });
});
