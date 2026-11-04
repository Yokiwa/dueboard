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
  it('minutes', () => {
    expect(relativeDue(plus(45 * MIN), now, 'zh')).toBe('45 分钟后');
    expect(relativeDue(plus(45 * MIN), now, 'en')).toBe('in 45 min');
  });
  it('hours when due later today', () => {
    expect(relativeDue(plus(6 * H), now, 'zh')).toBe('6 小时后');
    expect(relativeDue(plus(6 * H), now, 'en')).toBe('in 6 h');
  });
  it('tomorrow at any time', () => {
    expect(relativeDue(new Date('2026-11-05T23:59:00-05:00'), now, 'zh')).toBe('明天');
    expect(relativeDue(new Date('2026-11-05T00:30:00-05:00'), now, 'en')).toBe('Tomorrow');
  });
  it('calendar days', () => {
    expect(relativeDue(new Date('2026-11-07T09:00:00-05:00'), now, 'zh')).toBe('3 天后');
    expect(relativeDue(new Date('2026-11-07T09:00:00-05:00'), now, 'en')).toBe('in 3 days');
  });
  it('overdue', () => {
    expect(relativeDue(plus(-H), now, 'zh')).toBe('已逾期');
    expect(relativeDue(plus(-H), now, 'en')).toBe('Overdue');
  });
  it('tomorrow is calendar-based across DST', () => {
    const before = new Date('2027-03-13T22:00:00-05:00');
    const due = new Date('2027-03-14T23:59:00-04:00');
    expect(relativeDue(due, before, 'zh')).toBe('明天');
    expect(formatDueAt(due, before, 'zh')).toBe('明天 23:59');
  });
});

describe('formatDueAt', () => {
  it('today / tomorrow / other day', () => {
    expect(formatDueAt(new Date('2026-11-04T23:59:00-05:00'), now, 'zh')).toBe('今天 23:59');
    expect(formatDueAt(new Date('2026-11-04T23:59:00-05:00'), now, 'en')).toBe('Today 11:59 PM');
    expect(formatDueAt(new Date('2026-11-05T23:59:00-05:00'), now, 'zh')).toBe('明天 23:59');
    expect(formatDueAt(new Date('2026-11-07T23:59:00-05:00'), now, 'zh')).toBe('11月7日 23:59');
    expect(formatDueAt(new Date('2026-11-07T23:59:00-05:00'), now, 'en')).toBe('Nov 7, 11:59 PM');
  });
  it('adds the year when it differs', () => {
    expect(formatDueAt(new Date('2027-01-12T09:00:00-05:00'), now, 'zh')).toBe('2027年1月12日 09:00');
    expect(formatDueAt(new Date('2027-01-12T09:00:00-05:00'), now, 'en')).toBe('Jan 12, 2027, 9:00 AM');
  });
});

describe('formatCountdown', () => {
  it('under a day', () => {
    expect(formatCountdown(plus(5 * H + 42 * MIN + 18_000), now, 'zh')).toBe('05:42:18');
  });
  it('days prefix', () => {
    expect(formatCountdown(plus(2 * D + 3 * H), now, 'zh')).toBe('2 天 03:00:00');
    expect(formatCountdown(plus(2 * D + 3 * H), now, 'en')).toBe('2d 03:00:00');
  });
  it('past clamps to zero', () => {
    expect(formatCountdown(plus(-H), now, 'en')).toBe('00:00:00');
  });
});
