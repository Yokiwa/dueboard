import { describe, it, expect } from 'vitest';
import { findDueMatches, parseDateText, parseDueText } from '../../src/core/dueText';

const local = (y: number, mo: number, d: number, h = 23, mi = 59) => new Date(y, mo - 1, d, h, mi).toISOString();
const now = new Date(2026, 10, 7, 12, 0);
const due = (text: string, at = now) => findDueMatches(text, at)[0]?.dueAt ?? null;

describe('findDueMatches', () => {
  it('weekday, month name, time and zone (Wiley)', () => {
    expect(due('Due Monday, Nov 9 at 11:59 PM (EST)')).toBe('2026-11-10T04:59:00.000Z');
  });
  it('full month name with year and zone', () => {
    expect(due('Due: November 10, 2026 11:59 PM EST')).toBe('2026-11-11T04:59:00.000Z');
  });
  it('numeric US date with 4-digit year', () => {
    expect(due('Due Date: 11/10/2026 11:59 PM')).toBe(local(2026, 11, 10));
  });
  it('numeric US date with 2-digit year and lowercase pm', () => {
    expect(due('due 11/10/26 at 11:59pm')).toBe(local(2026, 11, 10));
  });
  it('ISO date and 24-hour time', () => {
    expect(due('Due 2026-11-10 23:59')).toBe(local(2026, 11, 10));
  });
  it('date without time is 11:59 PM local', () => {
    expect(due('Due Nov 12')).toBe(local(2026, 11, 12));
  });
  it('deadline label', () => {
    const [m] = findDueMatches('Deadline: Fri, Nov 13, 5:00 PM', now);
    expect(m?.label).toBe('deadline');
    expect(m?.dueAt).toBe(local(2026, 11, 13, 17, 0));
  });
  it('available-until label', () => {
    expect(findDueMatches('Available until Nov 20 11:59 PM', now)[0]?.label).toBe('until');
  });
  it('picks the year closest to now across New Year', () => {
    expect(due('Due Jan 5', new Date(2026, 11, 20, 12))).toBe(local(2027, 1, 5));
    expect(due('Due Dec 30', new Date(2027, 0, 3, 12))).toBe(local(2026, 12, 30));
  });
  it('ignores "due" without a date', () => {
    expect(findDueMatches('Due soon', now)).toEqual([]);
    expect(findDueMatches('Introduction due to weather', now)).toEqual([]);
    expect(findDueMatches('70% score reduction will be applied to work submitted after due date', now)).toEqual([]);
  });
  it('finds every labeled date in a block, in order', () => {
    const ms = findDueMatches('Due Nov 10 11:59 PM · Available until Nov 13 11:59 PM', now);
    expect(ms.map((m) => m.label)).toEqual(['due', 'until']);
    expect(ms.map((m) => m.dueAt)).toEqual([local(2026, 11, 10), local(2026, 11, 13)]);
  });
  it('keeps the matched text short and readable', () => {
    const [m] = findDueMatches(`${'x'.repeat(300)} Due: 11/10/2026 11:59 PM ${'y'.repeat(300)}`, now);
    expect(m?.text).toContain('Due: 11/10/2026 11:59 PM');
    expect(m!.text.length).toBeLessThanOrEqual(120);
  });
  it('rejects impossible dates', () => {
    expect(findDueMatches('Due 13/45/2026', now)).toEqual([]);
    expect(findDueMatches('Due Feb 31', now)).toEqual([]);
  });
});

describe('parseDateText', () => {
  it('parses a bare date with a default time', () => {
    expect(parseDateText('Oct 14', now, { defaultTime: [0, 0] })).toBe(local(2026, 10, 14, 0, 0));
  });
  it('returns null for text without a date', () => {
    expect(parseDateText('Exam 2', now)).toBeNull();
  });
});

describe('parseDueText', () => {
  it('returns the first Due date (Wiley compatibility)', () => {
    expect(parseDueText('Due Monday, Nov 9 at 11:59 PM (EST)', now)).toBe('2026-11-10T04:59:00.000Z');
    expect(parseDueText('Available until Nov 20', now)).toBeNull();
  });
});
