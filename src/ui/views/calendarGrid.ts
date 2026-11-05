import { addDays, format, startOfMonth, startOfWeek } from 'date-fns';
import type { Item } from '../../core/types';

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
