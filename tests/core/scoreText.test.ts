import { describe, expect, it } from 'vitest';
import { findScore, formatPoints } from '../../src/core/scoreText';

describe('formatPoints', () => {
  it('formats earned/possible without trailing zeros', () => {
    expect(formatPoints(18, 20)).toBe('18/20');
    expect(formatPoints(1.5, 25)).toBe('1.5/25');
    expect(formatPoints(18.0, 20.0)).toBe('18/20');
  });
});

describe('findScore', () => {
  const accepted: [string, string][] = [
    ['1.5 / 25 points', '1.5/25'],
    ['18/20 pts', '18/20'],
    ['Score: 18 / 20', '18/20'],
    ['Grade 9.5/10', '9.5/10'],
    ['Score: 92%', '92%'],
    ['Grade 87.5 %', '87.5%'],
    ['18 of 20 points earned', '18/20'],
  ];
  it.each(accepted)('accepts %s', (line, text) => {
    expect(findScore([line], 'WileyPLUS')?.text).toBe(text);
  });

  it('carries numbers, source and evidence', () => {
    expect(findScore(['  1.5 / 25 points  '], 'WileyPLUS')).toEqual({
      text: '1.5/25', earned: 1.5, possible: 25, from: 'WileyPLUS', evidence: '1.5 / 25 points',
    });
    const pct = findScore(['Score: 92%'], 'X')!;
    expect(pct.earned).toBeUndefined();
    expect(pct.possible).toBeUndefined();
  });

  it('trims evidence to 120 characters', () => {
    const line = `Score: 18 / 20 ${'x'.repeat(200)}`;
    expect(findScore([line], 'X')?.evidence).toHaveLength(120);
  });

  const rejected = [
    '3/10', 'Question 3 / 10', 'Page 2/5', '10 questions', 'Due 11/10/2026', '11/10',
    '70% score reduction will be applied to work submitted after due date',
    '50% score reduction after third attempt',
    'Score: 10% late penalty',
    '31 / 20 points', '5 / 0 points',
    'Result: 100%', 'Mark 50%', 'Points: 50%',
    'Question 3 of 10 points', 'Step 2 of 5 pts',
    'Passing score: 70%', 'Minimum grade 80%', 'Average score: 15/25', 'Grade 70% required to pass',
    'Score: 11/10/2026',
    'Class average: 15 / 25 points', 'Passing: 20 / 25 points', 'Minimum 18/25 pts',
    'Due 11/20 Points: 10', 'Due date 11/20 pts', 'Date: 3/10 points',
    'Progress: 3/10 points', 'Points 2/3 attempts', '3/10 points complete', 'Score: 4/10 questions answered',
    'Grade: 100% complete', 'Score: 80% completed', 'Grade 50% progress',
  ];
  it.each(rejected)('rejects %s', (line) => {
    expect(findScore([line], 'X')).toBeNull();
  });

  it('normalizes decimals and pins the strict 1.5x rule', () => {
    expect(findScore(['18.0 / 20.0 points'], 'X')?.text).toBe('18/20');
    expect(findScore(['30 / 20 points'], 'X')?.text).toBe('30/20');
    expect(findScore(['Your score: 18 / 25 points'], 'X')?.text).toBe('18/25');
  });
  it('ignores a class average next to the own score', () => {
    expect(findScore(['Your score: 18 / 25 points', 'Class average: 15 / 25 points'], 'X')?.text).toBe('18/25');
  });
  it('keeps a total label', () => {
    expect(findScore(['Total score: 18/20'], 'X')?.text).toBe('18/20');
  });
  it('gives null for two different unqualified scores', () => {
    expect(findScore(['Score: 18/25', '20 / 25 points'], 'X')).toBeNull();
  });
  it('accepts the same score repeated', () => {
    expect(findScore(['18 / 25 points', 'Score: 18/25'], 'X')?.text).toBe('18/25');
  });
  it('gives null on a list page with several "x / N points" slots', () => {
    expect(findScore(['HW9 25 / 25 points', 'HW10 25 / 25 points', 'HW11 -- / 25 points'], 'X')).toBeNull();
    expect(findScore(['HW10 18 / 25 points', 'HW11 -- / 25 points'], 'X')).toBeNull();
    expect(findScore(['18 / 25 points', '- / 25 pts'], 'X')).toBeNull();
  });
  it('gives null for per-question points ("Question 3 of 10")', () => {
    expect(findScore(['Question 3 of 10', '1 / 1 point'], 'X')).toBeNull();
    expect(findScore(['Problem 2 of 8', 'Score: 1/1'], 'X')).toBeNull();
  });
  it('gives null when the frame shows due dates that disagree', () => {
    const now = new Date('2026-11-10T12:00:00-05:00');
    expect(findScore(['HW10 Due Nov 9 at 11:59 PM', 'HW11 Due Nov 16 at 11:59 PM', 'Score: 18/25'], 'X', now)).toBeNull();
    expect(findScore(['Due Nov 9 at 11:59 PM', 'Due: Nov 9, 2026', 'Score: 18/25'], 'X', now)?.text).toBe('18/25');
  });
  it('reads the WileyPLUS header lines', () => {
    const lines = ['PHYS 172H - HW11 - FA26', '10 questions', '1.5 / 25 points', '1h 41m spent', 'Due Monday, Nov 9 at 11:59 PM (EST)', '70% score reduction will be applied to work submitted after due date'];
    expect(findScore(lines, 'WileyPLUS')?.text).toBe('1.5/25');
  });
});
