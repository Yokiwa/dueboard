import type { Item } from './types';

/** How course cards and the course detail split a course's work by time. */

export const WEEK_MS = 7 * 86_400_000;

const isDone = (i: Item) => i.doneByUser || i.submitted;
const due = (i: Item) => (i.dueAt ? Date.parse(i.dueAt) : Number.NaN);
const soonestFirst = (a: Item, b: Item) => due(a) - due(b) || a.title.localeCompare(b.title);
const unfinishedAfter = (items: Item[], t: number) => items.filter((i) => !isDone(i) && i.dueAt && due(i) > t);

export interface CardView {
  /** Unfinished work due between now and `until`, soonest first. */
  pending: Item[];
  /** Finished work due from 7 days ago to `until` (empty when finished work has its own section). */
  done: Item[];
  /** Unfinished work already past due: counted on the card, listed in the course detail. */
  overdue: number;
  /** End of the window: now + `weeks` × 7 days. */
  until: Date;
  /** Unfinished work due after the window. */
  hasLater: boolean;
  /** How many unfinished items "Show next week" would add. */
  nextCount: number;
}

/** A course card's view of its items, `weeks` weeks ahead of `now`. */
export function cardView(items: Item[], now: Date, weeks: number, showDone: boolean): CardView {
  const t = now.getTime();
  const end = t + weeks * WEEK_MS;
  const inWindow = (i: Item, from: number) => Boolean(i.dueAt) && due(i) > from && due(i) <= end;
  const later = unfinishedAfter(items, end);
  const nextEnd = t + nextWeeks(items, now, weeks) * WEEK_MS;
  return {
    pending: items.filter((i) => !isDone(i) && inWindow(i, t)).sort(soonestFirst),
    done: showDone ? items.filter((i) => isDone(i) && inWindow(i, t - WEEK_MS)).sort(soonestFirst) : [],
    overdue: items.filter((i) => !isDone(i) && i.dueAt && due(i) <= t).length,
    until: new Date(end),
    hasLater: later.length > 0,
    nextCount: later.filter((i) => due(i) <= nextEnd).length,
  };
}

/** The window after "Show next week": one more week, or up to the week of the next unfinished item if that is later. */
export function nextWeeks(items: Item[], now: Date, weeks: number): number {
  const t = now.getTime();
  const next = unfinishedAfter(items, t + weeks * WEEK_MS).sort(soonestFirst).at(0);
  return next ? Math.max(weeks + 1, Math.ceil((due(next) - t) / WEEK_MS)) : weeks + 1;
}

/** Finished work due from 7 days ago to 7 days ahead, across courses: the "Done this week" section. */
export function doneThisWeek(items: Item[], now: Date): Item[] {
  const t = now.getTime();
  return items.filter((i) => isDone(i) && i.dueAt && due(i) > t - WEEK_MS && due(i) <= t + WEEK_MS).sort(soonestFirst);
}

export interface DetailGroups {
  overdue: Item[];
  upcoming: Item[];
  undated: Item[];
  /** Newest due date first; undated last. */
  completed: Item[];
}

/** A course detail's sections. */
export function detailGroups(items: Item[], now: Date): DetailGroups {
  const t = now.getTime();
  const open = items.filter((i) => !isDone(i));
  return {
    overdue: open.filter((i) => i.dueAt && due(i) <= t).sort(soonestFirst),
    upcoming: open.filter((i) => i.dueAt && due(i) > t).sort(soonestFirst),
    undated: open.filter((i) => !i.dueAt),
    completed: items.filter(isDone).sort((a, b) => (due(b) || 0) - (due(a) || 0)),
  };
}
