import { describe, it, expect } from 'vitest';
import { extractCourseCode, normalizeTitle } from '../../src/core/courseCode';

describe('extractCourseCode', () => {
  it.each([
    ['CS 18000-LEC Fall 2026', 'CS 18000'],
    ['cs18000', 'CS 18000'],
    ['MA 261', 'MA 26100'],
    ['PHYS 17200', 'PHYS 17200'],
    ['Fall 2026 CHM 11500 - Lecture', 'CHM 11500'],
    ['Orientation', null],
  ])('%s → %s', (name, code) => {
    expect(extractCourseCode(name)).toBe(code);
  });
});

describe('normalizeTitle', () => {
  it.each([
    ['Project 3 - Due', 'project3'],
    ['HW #4 (due)', 'hw4'],
    ['作业 1：函数', '作业1函数'],
    ['Due Diligence Essay', 'duediligenceessay'],
  ])('%s → %s', (title, norm) => {
    expect(normalizeTitle(title)).toBe(norm);
  });
});
