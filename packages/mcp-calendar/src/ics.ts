import fs from 'node:fs';
import path from 'node:path';
import { createEvent, type EventAttributes } from 'ics';

export function buildIcs(opts: { title: string; description: string; due_date: string; days_before: number[]; uid: string }): string {
  const [y, m, d] = opts.due_date.split('-').map(Number) as [number, number, number];
  const event: EventAttributes = {
    uid: `${opts.uid}@refundsloth.local`,
    title: `🦥 ${opts.title}`,
    description: opts.description,
    start: [y, m, d],
    duration: { days: 1 },
    productId: 'refund-sloth/ics',
    calName: 'Refund Sloth',
    alarms: opts.days_before.map((n) => ({ action: 'display' as const, description: `${opts.title} in ${n} day(s)`, trigger: { days: n, before: true } })),
  };
  const { error, value } = createEvent(event);
  if (error || !value) throw error ?? new Error('ics generation failed');
  return value;
}

export function writeIcs(dir: string, deadlineId: string, content: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${deadlineId}.ics`);
  fs.writeFileSync(p, content);
  return p;
}
