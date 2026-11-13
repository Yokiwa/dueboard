import { describe, it, expect } from 'vitest';
import { weekDays, monthCells, itemsByDay, dayKey, weekHours, layoutDay } from '../../src/ui/views/calendarGrid';
import type { Meeting } from '../../src/core/types';
import { item } from './fixtures';

describe('calendarGrid', () => {
  it('weekDays starts on Sunday and has 7 days', () => {
    const days = weekDays(new Date('2026-11-04T12:00:00-05:00'));
    expect(days.map(dayKey)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  });
  it('monthCells for 2026-11 starts on Sun 2026-11-01 and has 42 cells', () => {
    const cells = monthCells(new Date('2026-11-15T12:00:00-05:00'));
    expect(cells).toHaveLength(42);
    expect(dayKey(cells[0]!)).toBe('2026-11-01');
    expect(dayKey(cells[41]!)).toBe('2026-12-12');
  });
  it('monthCells for 2027-01 starts on the Sunday before the 1st', () => {
    expect(dayKey(monthCells(new Date('2027-01-10T12:00:00-05:00'))[0]!)).toBe('2026-12-27');
  });
  it('itemsByDay groups by local date and skips undated items', () => {
    const m = itemsByDay([item('a', 'c', 'A', '2026-11-05T04:59:00Z'), item('b', 'c', 'B', null), item('c', 'c', 'C', '2026-11-04T14:00:00Z')]);
    expect([...m.keys()]).toEqual(['2026-11-04']);
    expect(m.get('2026-11-04')!.map((i) => i.id)).toEqual(['c', 'a']);
  });
});

describe('calendarGrid: a week of class meetings (time grid)', () => {
  // Nov 1–7, 2026 (Indiana time, EST −05:00 after Nov 1).
  const week = weekDays(new Date('2026-11-04T12:00:00-05:00'));
  const thu = week[4]!;
  const m = (id: string, start: string, end: string, title = id): Meeting => ({
    id, courseId: 'b:1', title, startAt: new Date(`2026-11-05T${start}:00-05:00`).toISOString(), endAt: new Date(`2026-11-05T${end}:00-05:00`).toISOString(), url: 'u',
  });

  it('no meetings in the week gives no grid', () => {
    expect(weekHours([], week)).toBeNull();
    const nextWeek: Meeting = { ...m('a', '09:30', '10:20'), startAt: '2026-11-12T14:30:00.000Z', endAt: '2026-11-12T15:20:00.000Z' };
    expect(weekHours([nextWeek], week)).toBeNull();
  });

  it('range is 8–18 for a 9:30–10:20 class, 7–20 for 7:30 and 19:15–19:45', () => {
    expect(weekHours([m('a', '09:30', '10:20')], week)).toEqual({ from: 8, to: 18 });
    expect(weekHours([m('a', '07:30', '08:20'), m('b', '19:15', '19:45')], week)).toEqual({ from: 7, to: 20 });
  });

  it('a 9:30–10:20 class is at 570 minutes, 50 tall', () => {
    expect(layoutDay([m('a', '09:30', '10:20')], thu)).toEqual([{ meeting: expect.objectContaining({ id: 'a' }), top: 570, height: 50, col: 0, cols: 1 }]);
  });

  it('two overlapping meetings get col 0 and 1 of 2', () => {
    const out = layoutDay([m('a', '09:30', '10:20'), m('b', '10:00', '11:00')], thu);
    expect(out.map((o) => [o.meeting.id, o.col, o.cols])).toEqual([['a', 0, 2], ['b', 1, 2]]);
  });

  it('three overlapping meetings share the column in thirds', () => {
    const out = layoutDay([m('a', '09:00', '10:00'), m('b', '09:00', '10:00'), m('c', '09:30', '10:30')], thu);
    expect(out.map((o) => [o.meeting.id, o.col, o.cols])).toEqual([['a', 0, 3], ['b', 1, 3], ['c', 2, 3]]);
  });

  it('back-to-back meetings (10:20 end, 10:20 start) do not overlap', () => {
    const out = layoutDay([m('a', '09:30', '10:20'), m('b', '10:20', '11:10')], thu);
    expect(out.map((o) => [o.col, o.cols])).toEqual([[0, 1], [0, 1]]);
  });

  it('a later meeting reuses a freed column within one overlap group', () => {
    const out = layoutDay([m('a', '09:00', '11:00'), m('b', '09:30', '10:00'), m('c', '10:15', '10:45')], thu);
    expect(out.map((o) => [o.meeting.id, o.col, o.cols])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 1, 2]]);
  });

  it('a meeting past midnight is cut at the end of its day', () => {
    const late: Meeting = { ...m('a', '23:30', '23:59'), endAt: new Date('2026-11-06T00:40:00-05:00').toISOString() };
    expect(layoutDay([late], thu)).toEqual([expect.objectContaining({ top: 1410, height: 30 })]);
  });

  it('only the day\'s own meetings are laid out', () => {
    const fri: Meeting = { ...m('f', '09:30', '10:20'), startAt: '2026-11-06T14:30:00.000Z', endAt: '2026-11-06T15:20:00.000Z' };
    expect(layoutDay([m('a', '09:30', '10:20'), fri], thu).map((o) => o.meeting.id)).toEqual(['a']);
  });
});
