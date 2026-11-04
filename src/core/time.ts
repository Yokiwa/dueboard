import { differenceInCalendarDays, format, isSameYear } from 'date-fns';

export type Lang = 'zh' | 'en';
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

/** Short label such as "6 小时后" / "明天" / "3 天后". "Tomorrow" follows the local calendar, not 24 hours. */
export function relativeDue(dueAt: Date, now: Date, lang: Lang): string {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return lang === 'zh' ? '已逾期' : 'Overdue';
  const days = differenceInCalendarDays(dueAt, now);
  if (diff < HOUR) {
    const m = Math.max(1, Math.ceil(diff / MIN));
    return lang === 'zh' ? `${m} 分钟后` : `in ${m} min`;
  }
  if (days === 0) {
    const h = Math.floor(diff / HOUR);
    return lang === 'zh' ? `${h} 小时后` : `in ${h} h`;
  }
  if (days === 1) return lang === 'zh' ? '明天' : 'Tomorrow';
  return lang === 'zh' ? `${days} 天后` : `in ${days} days`;
}

/** Absolute due time: "今天 23:59", "明天 23:59", "11月7日 23:59" (year added when it differs). */
export function formatDueAt(dueAt: Date, now: Date, lang: Lang): string {
  const days = differenceInCalendarDays(dueAt, now);
  const time = lang === 'zh' ? format(dueAt, 'HH:mm') : format(dueAt, 'h:mm a');
  if (days === 0) return lang === 'zh' ? `今天 ${time}` : `Today ${time}`;
  if (days === 1) return lang === 'zh' ? `明天 ${time}` : `Tomorrow ${time}`;
  const sameYear = isSameYear(dueAt, now);
  if (lang === 'zh') return `${format(dueAt, sameYear ? 'M月d日' : 'yyyy年M月d日')} ${time}`;
  return `${format(dueAt, sameYear ? 'MMM d' : 'MMM d, yyyy')}, ${time}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Live countdown "05:42:18", with a day prefix past 24 hours. Never negative. */
export function formatCountdown(dueAt: Date, now: Date, lang: Lang): string {
  const diff = Math.max(0, dueAt.getTime() - now.getTime());
  const d = Math.floor(diff / DAY);
  const h = Math.floor((diff % DAY) / HOUR);
  const m = Math.floor((diff % HOUR) / MIN);
  const s = Math.floor((diff % MIN) / 1000);
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (d === 0) return clock;
  return lang === 'zh' ? `${d} 天 ${clock}` : `${d}d ${clock}`;
}
