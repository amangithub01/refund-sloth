import type { Deadline } from '../api';

/** Builds a downloadable .ics in the browser, since the demo has no reminders folder. */
export function icsDataUrl(d: Deadline) {
  const day = d.due_date.replaceAll('-', '');
  const what = `${d.merchant}${d.item_name ? ` – ${d.item_name}` : ''}: ${d.type.replace('_', ' ')}`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Refund Sloth//demo//EN', 'BEGIN:VEVENT', `UID:${d.id}@refund-sloth`,
    `DTSTART;VALUE=DATE:${day}`, `SUMMARY:🦥 ${what}`, 'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', `DESCRIPTION:${what}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
