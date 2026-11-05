import { describe, it, expect } from 'vitest';
import { toEventItem } from '../../src/connectors/brightspace/map';

const ev = (Title: string) => ({ CalendarEventId: 1, OrgUnitId: 2, Title, StartDateTime: '2026-11-06T04:59:00.000Z', EndDateTime: null, AssociatedEntity: null });

describe('calendar deadline filter (word boundaries)', () => {
  it.each(['Lab Section', 'Collaborate session', 'Syllabus review', 'Example problems', 'Lecture 12', 'Office hours'])('skips "%s"', (t) => {
    expect(toEventItem(ev(t), 'https://b')).toBeNull();
  });
  it.each(['WebAssign 14.3 due', 'Lab Report 5', 'Lab 4 due', 'Midterm Exam 2', 'Final exam', 'HW 6', 'Project 2 checkpoint', 'Quiz 3'])('keeps "%s"', (t) => {
    expect(toEventItem(ev(t), 'https://b')).not.toBeNull();
  });
});
