import { describe, it, expect } from 'vitest';
import { cardView, detailGroups, doneThisWeek, nextWeeks } from '../../src/core/courseWeek';
import { item, NOW } from '../ui/fixtures';

// NOW = Wed 2026-11-04 12:00 EST; the first 7-day window ends Wed 2026-11-11 12:00.
const items = [
  item('late', 'c', 'Late HW', '2026-11-01T23:59:00-05:00'),
  item('oldDone', 'c', 'Old HW', '2026-10-20T23:59:00-05:00', { doneByUser: true }),
  item('weekDone', 'c', 'Done HW', '2026-11-02T23:59:00-05:00', { submitted: true }),
  item('soon', 'c', 'Soon HW', '2026-11-05T23:59:00-05:00'),
  item('soonDone', 'c', 'Soon done', '2026-11-06T23:59:00-05:00', { doneByUser: true }),
  item('fri', 'c', 'Fri HW', '2026-11-06T17:00:00-05:00'),
  item('next', 'c', 'Next HW', '2026-11-13T23:59:00-05:00'),
  item('far', 'c', 'Far HW', '2026-12-01T23:59:00-05:00'),
  item('undated', 'c', 'Reading', null),
];
const titles = (xs: { title: string }[]) => xs.map((x) => x.title);

describe('cardView', () => {
  it('shows only unfinished work due in the next 7 days, soonest first; overdue is counted, not shown', () => {
    const v = cardView(items, NOW, 1, true);
    expect(titles(v.pending)).toEqual(['Soon HW', 'Fri HW']);
    expect(v.overdue).toBe(1);
    expect(v.until.toISOString()).toBe(new Date('2026-11-11T12:00:00-05:00').toISOString());
  });

  it('lists finished work from the past 7 days through the window, for the bottom of the card', () => {
    expect(titles(cardView(items, NOW, 1, true).done)).toEqual(['Done HW', 'Soon done']);
  });

  it('leaves finished work out when it is shown in its own section', () => {
    expect(cardView(items, NOW, 1, false).done).toEqual([]);
  });

  it('counts what "Show next week" would add, and whether anything is left after the window', () => {
    const v = cardView(items, NOW, 1, true);
    expect(v.nextCount).toBe(1);
    expect(v.hasLater).toBe(true);
    const all = cardView(items, NOW, 5, true);
    expect(titles(all.pending)).toEqual(['Soon HW', 'Fri HW', 'Next HW', 'Far HW']);
    expect(all.hasLater).toBe(false);
  });
});

describe('nextWeeks', () => {
  it('adds one week', () => {
    expect(nextWeeks(items, NOW, 1)).toBe(2);
  });

  it('skips empty weeks up to the week of the next unfinished item', () => {
    // After 2 weeks (to Nov 18) the next unfinished item is Dec 1: 27 days out, so the window grows to 4 weeks.
    expect(nextWeeks(items, NOW, 2)).toBe(4);
  });
});

describe('doneThisWeek', () => {
  it('lists finished work due from 7 days ago to 7 days ahead, soonest first', () => {
    expect(titles(doneThisWeek(items, NOW))).toEqual(['Done HW', 'Soon done']);
  });
});

describe('detailGroups', () => {
  it('splits a course into overdue, upcoming, no due date and completed (newest first)', () => {
    const g = detailGroups(items, NOW);
    expect(titles(g.overdue)).toEqual(['Late HW']);
    expect(titles(g.upcoming)).toEqual(['Soon HW', 'Fri HW', 'Next HW', 'Far HW']);
    expect(titles(g.undated)).toEqual(['Reading']);
    expect(titles(g.completed)).toEqual(['Soon done', 'Done HW', 'Old HW']);
  });
});
