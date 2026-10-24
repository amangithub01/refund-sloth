import { addDays as dfAddDays, addMonths as dfAddMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';

/** Single source of "today". Respects SLOTH_TODAY=YYYY-MM-DD for deterministic demos/evals. */
export function now(): Date {
  const fixed = process.env.SLOTH_TODAY;
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) {
    const real = new Date();
    const d = parseISO(fixed);
    d.setHours(real.getHours(), real.getMinutes(), real.getSeconds());
    return d;
  }
  return new Date();
}

export const toISODate = (d: Date): string => format(d, 'yyyy-MM-dd');
export const today = (): string => toISODate(now());
export const fromISODate = (s: string): Date => parseISO(s);
export const addDaysISO = (iso: string, n: number): string => toISODate(dfAddDays(parseISO(iso), n));
/** date-fns clamps month ends: 2026-01-31 + 1 month = 2026-02-28. */
export const addMonthsISO = (iso: string, n: number): string => toISODate(dfAddMonths(parseISO(iso), n));
export const daysUntil = (iso: string): number => differenceInCalendarDays(parseISO(iso), parseISO(today()));
export const nowStamp = (): string => now().toISOString();
/** Whole days from `fromISO` to `toISO` (to - from). */
export const differenceDays = (toISO: string, fromISO: string): number => differenceInCalendarDays(parseISO(toISO), parseISO(fromISO));
