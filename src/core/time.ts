import { differenceInCalendarDays, format, isSameYear } from 'date-fns';

export type Urgency = 'overdue' | 'urgent' | 'soon' | 'normal';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function urgency(dueAt: Date, now: Date): Urgency {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return 'overdue';
  if (diff <= 48 * HOUR) return 'urgent';
  if (diff <= 7 * DAY) return 'soon';
  return 'normal';
}

/** Short label such as "in 6 h" / "Tomorrow" / "in 3 days". "Tomorrow" follows the local calendar, not 24 hours. */
export function relativeDue(dueAt: Date, now: Date): string {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return 'Overdue';
  const days = differenceInCalendarDays(dueAt, now);
  if (diff < HOUR) return `in ${Math.max(1, Math.ceil(diff / MIN))} min`;
  if (days === 0) return `in ${Math.floor(diff / HOUR)} h`;
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

/** Absolute due time: "Today 11:59 PM", "Tomorrow 11:59 PM", "Nov 7, 11:59 PM" (year added when it differs). */
export function formatDueAt(dueAt: Date, now: Date): string {
  const days = differenceInCalendarDays(dueAt, now);
  const time = format(dueAt, 'h:mm a');
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${format(dueAt, isSameYear(dueAt, now) ? 'MMM d' : 'MMM d, yyyy')}, ${time}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Live countdown "05:42:18", with a day prefix past 24 hours. Never negative. */
export function formatCountdown(dueAt: Date, now: Date): string {
  const diff = Math.max(0, dueAt.getTime() - now.getTime());
  const d = Math.floor(diff / DAY);
  const clock = `${pad(Math.floor((diff % DAY) / HOUR))}:${pad(Math.floor((diff % HOUR) / MIN))}:${pad(Math.floor((diff % MIN) / 1000))}`;
  return d === 0 ? clock : `${d}d ${clock}`;
}
