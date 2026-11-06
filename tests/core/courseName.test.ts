import { describe, it, expect } from 'vitest';
import { displayName } from '../../src/core/courseName';

describe('displayName', () => {
  it.each([
    ['Fall 2026 CHM 11510 - Merge', 'CHM 11510', ''],
    ['Fall 2026 PHYS 17200-H01 LEC', 'PHYS 17200', ''],
    ['Fall 2026 TDM 10100 - Merge', 'TDM 10100', ''],
    ['Spring 2027 MA 26100 Multivariate Calculus - LEC', 'MA 26100', 'Multivariate Calculus'],
    ['CS 18000-LEC Fall 2026', 'CS 18000', ''],
    ['CS 180 Problem Solving and Object-Oriented Programming', 'CS 18000', 'Problem Solving and Object-Oriented Programming'],
    ['Java 编程入门', 'CS 18000', 'Java 编程入门'],
    ['Physics Lab', 'Physics Lab', ''],
    ['ENGL 10600 First-Year Composition (Online)', 'ENGL 10600', 'First-Year Composition (Online)'],
    ['Fall 2026 MA 26100 331 332 333', 'MA 26100', ''],
    ['MA 26100-331, 332, 333 Multivariate Calculus', 'MA 26100', 'Multivariate Calculus'],
    ['Calculus 2', 'MA 16600', 'Calculus 2'],
  ])('%s → "%s"', (name, code, expected) => {
    expect(displayName({ name, code })).toBe(expected);
  });
});
