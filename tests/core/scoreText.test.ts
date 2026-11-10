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
  ];
  it.each(rejected)('rejects %s', (line) => {
    expect(findScore([line], 'X')).toBeNull();
  });

  it('gives null for two different labeled scores', () => {
    expect(findScore(['Your score: 18 / 25 points', 'Class average: 15 / 25 points'], 'X')).toBeNull();
  });
  it('accepts the same score repeated', () => {
    expect(findScore(['18 / 25 points', 'Score: 18/25'], 'X')?.text).toBe('18/25');
  });
  it('reads the WileyPLUS header lines', () => {
    const lines = ['PHYS 172H - HW11 - FA26', '10 questions', '1.5 / 25 points', '1h 41m spent', 'Due Monday, Nov 9 at 11:59 PM (EST)', '70% score reduction will be applied to work submitted after due date'];
    expect(findScore(lines, 'WileyPLUS')?.text).toBe('1.5/25');
  });
});
