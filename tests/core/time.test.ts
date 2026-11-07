import { describe, it, expect } from 'vitest';
import { urgency, relativeDue, formatDueAt, formatCountdown } from '../../src/core/time';

const now = new Date('2026-11-04T12:00:00-05:00'); // Wed noon, Indiana (EST)
const plus = (ms: number) => new Date(now.getTime() + ms);
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe('timezone setup', () => {
  it('runs in America/Indiana/Indianapolis', () => {
    expect(new Date('2026-11-04T12:00:00-05:00').getHours()).toBe(12);
    expect(new Date('2027-03-15T12:00:00-04:00').getHours()).toBe(12); // DST observed
  });
});

describe('urgency', () => {
  it.each([
    [-MIN, 'overdue'],
    [47 * H, 'urgent'],
    [48 * H, 'urgent'],
    [3 * D, 'soon'],
    [7 * D, 'soon'],
    [8 * D, 'normal'],
  ])('%d ms → %s', (ms, expected) => {
    expect(urgency(plus(ms), now)).toBe(expected);
  });
});

describe('relativeDue', () => {
  it('minutes', () => expect(relativeDue(plus(45 * MIN), now)).toBe('in 45 min'));
  it('hours when due later today', () => expect(relativeDue(plus(6 * H), now)).toBe('in 6 h'));
  it('tomorrow at any time', () => {
    expect(relativeDue(new Date('2026-11-05T23:59:00-05:00'), now)).toBe('Tomorrow');
    expect(relativeDue(new Date('2026-11-05T00:30:00-05:00'), now)).toBe('Tomorrow');
  });
  it('calendar days', () => expect(relativeDue(new Date('2026-11-07T09:00:00-05:00'), now)).toBe('in 3 days'));
  it('overdue', () => expect(relativeDue(plus(-H), now)).toBe('Overdue'));
  it('tomorrow is calendar-based across DST', () => {
    const before = new Date('2027-03-13T22:00:00-05:00');
    const due = new Date('2027-03-14T23:59:00-04:00');
    expect(relativeDue(due, before)).toBe('Tomorrow');
    expect(formatDueAt(due, before)).toBe('Tomorrow 11:59 PM');
  });
});

describe('formatDueAt', () => {
  it('today / tomorrow / other day', () => {
    expect(formatDueAt(new Date('2026-11-04T23:59:00-05:00'), now)).toBe('Today 11:59 PM');
    expect(formatDueAt(new Date('2026-11-05T23:59:00-05:00'), now)).toBe('Tomorrow 11:59 PM');
    expect(formatDueAt(new Date('2026-11-07T23:59:00-05:00'), now)).toBe('Nov 7, 11:59 PM');
  });
  it('adds the year when it differs', () => {
    expect(formatDueAt(new Date('2027-01-12T09:00:00-05:00'), now)).toBe('Jan 12, 2027, 9:00 AM');
  });
});

describe('formatCountdown', () => {
  it('under a day', () => expect(formatCountdown(plus(5 * H + 42 * MIN + 18_000), now)).toBe('05:42:18'));
  it('days prefix', () => expect(formatCountdown(plus(2 * D + 3 * H), now)).toBe('2d 03:00:00'));
  it('past clamps to zero', () => expect(formatCountdown(plus(-H), now)).toBe('00:00:00'));
});
