/**
 * Study days roll over at 04:00 local time (like Anki), so a late-night session counts
 * towards the day it started in.
 */
export const ROLLOVER_HOUR = 4;

export function dayStart(ts: number): number {
  const d = new Date(ts);
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(ROLLOVER_HOUR, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Start of the next study day (the end of "today"). */
export function dayEnd(ts: number): number {
  return addDays(dayStart(ts), 1);
}

function ymd(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "YYYY-MM-DD" of the study day containing ts. */
export function dayKey(ts: number): string {
  return ymd(dayStart(ts));
}

/** Monday 04:00 of the study week containing ts. */
export function weekStart(ts: number): number {
  const start = dayStart(ts);
  const weekday = (new Date(start).getDay() + 6) % 7; // Monday = 0
  return addDays(start, -weekday);
}

export function weekKey(ts: number): string {
  return ymd(weekStart(ts));
}

export function dayKeyToTs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, ROLLOVER_HOUR).getTime();
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekdayLabel(ts: number): string {
  return WEEKDAYS[new Date(ts).getDay()];
}
