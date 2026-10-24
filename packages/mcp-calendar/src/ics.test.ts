import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics.ts';

describe('ics', () => {
  it('builds an all-day event with alarms', () => {
    const s = buildIcs({ title: 'Return headphones', description: 'Best Buy', due_date: '2026-10-27', days_before: [3, 1], uid: 'dl_x' });
    expect(s).toContain('BEGIN:VEVENT');
    expect(s).toContain('DTSTART;VALUE=DATE:20261027');
    expect((s.match(/BEGIN:VALARM/g) ?? []).length).toBe(2);
  });
});
