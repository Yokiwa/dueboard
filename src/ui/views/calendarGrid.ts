import { addDays, format, startOfMonth, startOfWeek } from 'date-fns';
import type { Item, Meeting } from '../../core/types';

/** Local calendar date key, e.g. "2026-11-04". */
export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** The 7 days (Sunday first) of the week containing `anchor`. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6 weeks × 7 days covering the month of `anchor`, starting on the Sunday on/before the 1st. */
export function monthCells(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Items with a due date grouped by local day, each day sorted by due time. */
export function itemsByDay(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  for (const it of items) {
    if (!it.dueAt) continue;
    const key = dayKey(new Date(it.dueAt));
    const list = map.get(key) ?? [];
    list.push(it);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  return map;
}

/** "9:30–10:20 AM", or "11:30 AM–12:20 PM" when the class crosses noon. */
export function timeRange(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  return format(s, 'a') === format(e, 'a') ? `${format(s, 'h:mm')}–${format(e, 'h:mm a')}` : `${format(s, 'h:mm a')}–${format(e, 'h:mm a')}`;
}

const DAY_MIN = 24 * 60;
/** Minutes from the local midnight of `day` to `d`, cut to the day (0–1440). */
function minutesInto(day: Date, d: Date): number {
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return Math.min(DAY_MIN, Math.max(0, Math.round((d.getTime() - midnight) / 60_000)));
}

/**
 * The hours the week's time grid shows: from the earliest class start (rounded down to the hour) to the latest end
 * (rounded up), never less than 8 AM–6 PM. Null when no class falls in `days`: the week then shows no grid.
 */
export function weekHours(meetings: Meeting[], days: Date[]): { from: number; to: number } | null {
  const keys = new Set(days.map(dayKey));
  let from = 8;
  let to = 18;
  let any = false;
  for (const m of meetings) {
    const start = new Date(m.startAt);
    if (!keys.has(dayKey(start))) continue;
    any = true;
    from = Math.min(from, Math.floor(minutesInto(start, start) / 60));
    to = Math.max(to, Math.ceil(minutesInto(start, new Date(m.endAt)) / 60));
  }
  return any ? { from, to } : null;
}

export interface PlacedMeeting {
  meeting: Meeting;
  /** Minutes from the day's midnight. */
  top: number;
  height: number;
  /** Column within the meetings it overlaps, and how many columns they share. */
  col: number;
  cols: number;
}

/** The day's class meetings placed by time; meetings that overlap share the width side by side. */
export function layoutDay(meetings: Meeting[], day: Date): PlacedMeeting[] {
  const key = dayKey(day);
  const placed = meetings
    .filter((m) => dayKey(new Date(m.startAt)) === key)
    .map((meeting) => {
      const top = minutesInto(day, new Date(meeting.startAt));
      const end = minutesInto(day, new Date(meeting.endAt));
      return { meeting, top, height: Math.max(1, end - top), col: 0, cols: 1 };
    })
    .sort((a, b) => a.top - b.top || a.height - b.height);
  // Overlap groups: runs of meetings whose spans chain together. Within a group, each takes the first free column.
  let group: typeof placed = [];
  let groupEnd = -1;
  let columnEnds: number[] = [];
  const close = () => {
    for (const p of group) p.cols = columnEnds.length;
    group = [];
    columnEnds = [];
  };
  for (const p of placed) {
    if (p.top >= groupEnd) close();
    const free = columnEnds.findIndex((end) => end <= p.top);
    p.col = free >= 0 ? free : columnEnds.length;
    columnEnds[p.col] = p.top + p.height;
    group.push(p);
    groupEnd = Math.max(groupEnd, p.top + p.height);
  }
  close();
  return placed;
}
