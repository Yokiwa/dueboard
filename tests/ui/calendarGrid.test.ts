import { describe, it, expect } from 'vitest';
import { weekDays, monthCells, itemsByDay, dayKey } from '../../src/ui/views/calendarGrid';
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
