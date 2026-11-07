import { describe, it, expect } from 'vitest';
import { extractSyllabusRows } from '../../src/syllabus/extract';

const term = { start: new Date(2026, 7, 24), end: new Date(2026, 11, 19) };
const now = new Date(2026, 10, 7, 12);
const local = (mo: number, d: number, h = 23, mi = 59) => new Date(2026, mo - 1, d, h, mi).toISOString();
const rows = (...lines: string[]) => extractSyllabusRows(lines, term, now);

describe('extractSyllabusRows', () => {
  it('reads a schedule table row with an exam (all day when no time is given)', () => {
    expect(rows('Week 7 | Oct 14 | Exam 2')).toEqual([{ title: 'Exam 2', dueAt: local(10, 14, 0, 0), allDay: true, excerpt: 'Week 7 | Oct 14 | Exam 2' }]);
  });
  it('keeps a written time', () => {
    expect(rows('HW 5 due Fri 10/9 11:59 PM')).toEqual([{ title: 'HW 5 due', dueAt: local(10, 9), allDay: false, excerpt: 'HW 5 due Fri 10/9 11:59 PM' }]);
  });
  it('reads day-month dates and defaults work to 11:59 PM', () => {
    expect(rows('10-Nov | Project proposal due')[0]).toMatchObject({ title: 'Project proposal due', dueAt: local(11, 10), allDay: false });
  });
  it('drops rows without a work word', () => {
    expect(rows('Nov. 26 | Thanksgiving break')).toEqual([]);
  });
  it('drops rows without a calendar date', () => {
    expect(rows('Week 5 | Homework 4')).toEqual([]);
  });
  it('drops rows outside the term', () => {
    expect(rows('Jan 12 | Quiz 1')).toEqual([]);
  });
  it('lists a repeated row once', () => {
    expect(rows('Oct 14 | Exam 2', 'Oct 14 | Exam 2')).toHaveLength(1);
  });
  it('titles a row by its work cells', () => {
    expect(rows('Week 9 | Oct 28 | Ch. 6 reading | Quiz 5')[0]!.title).toBe('Quiz 5');
  });
  it('keeps long titles short', () => {
    expect(rows(`Oct 30 | Project ${'x'.repeat(200)}`)[0]!.title.length).toBeLessThanOrEqual(80);
  });
});
