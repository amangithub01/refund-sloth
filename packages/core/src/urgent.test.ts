import { describe, expect, it } from 'vitest';
import { pickUrgent } from './agents/boss.ts';

describe('urgent alerts', () => {
  const rows = [
    { id: 'a', type: 'trial_end', due_date: '2026-10-23' },
    { id: 'b', type: 'return_by', due_date: '2026-10-21' },
    { id: 'c', type: 'warranty_until', due_date: '2026-10-22' },
    { id: 'd', type: 'trial_end', due_date: '2026-10-24' },
    { id: 'e', type: 'renewal', due_date: '2026-10-20' },
  ];
  it('keeps non-warranty deadlines from today to today + N days', () => {
    expect(pickUrgent(rows, '2026-10-21', 2).map((r) => r.id)).toEqual(['a', 'b']);
    expect(pickUrgent(rows, '2026-10-21', 0).map((r) => r.id)).toEqual(['b']);
  });
});
