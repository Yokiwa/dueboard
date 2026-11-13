import { describe, it, expect } from 'vitest';
import { toEventItem } from '../../src/connectors/brightspace/map';

const ev = (Title: string, Description: string | null = null) => ({
  CalendarEventId: 1,
  OrgUnitId: 2,
  Title,
  Description,
  StartDateTime: '2026-11-06T04:59:00.000Z',
  EndDateTime: null,
  AssociatedEntity: null,
});

describe('calendar deadline filter (word boundaries)', () => {
  it.each(['Lab Section', 'Collaborate session', 'Syllabus review', 'Example problems', 'Lecture 12', 'Office hours'])('skips "%s"', (t) => {
    expect(toEventItem(ev(t), 'https://b')).toBeNull();
  });
  it.each(['WebAssign 14.3 due', 'Lab Report 5', 'Lab 4 due', 'Midterm Exam 2', 'Final exam', 'HW 6', 'Project 2 checkpoint', 'Quiz 3'])('keeps "%s"', (t) => {
    expect(toEventItem(ev(t), 'https://b')).not.toBeNull();
  });
});

// Issue #19: humanities courses post each reading as a plain calendar event titled after the text ("Zarathustra");
// the work is only described in the event's description.
describe('calendar events whose description assigns work', () => {
  const zarathustra =
    "Friedrich Nietzsche, Thus Spoke Zarathustra, 'Zarathustra's Prologue,' pg. 121-139 in The Portable Nietzsche.\n\n" +
    'Reading Questions: Why does Zarathustra leave his mountain solitude to go back down among people?';

  it('keeps a reading posted under the title of the text', () => {
    expect(toEventItem(ev('Zarathustra', zarathustra), 'https://b')).toMatchObject({
      sourceItemId: 'event:1',
      title: 'Zarathustra',
      type: 'event',
      dueAt: '2026-11-06T04:59:00.000Z',
    });
  });

  it.each([
    ['Plato', 'Read the Apology, pp. 23-45.'],
    ['Antigone', '<p>Reading: Sophocles, <em>Antigone</em>, lines 1-500</p>'],
    ['Response 4', 'Write a 300-word response to the prompt and submit it before class.'],
    ['Homer', 'Chapters 1-3 of the Odyssey'],
  ])('keeps "%s"', (title, description) => {
    expect(toEventItem(ev(title, description), 'https://b')).not.toBeNull();
  });

  it.each([
    ['Lecture 12', 'Read chapter 4 before class.'],
    ['Office hours', 'Questions about the reading welcome.'],
    ['Recitation', 'Bring page 12 of your notes.'],
    ['Thanksgiving break', 'No class.'],
    ['Guest speaker', 'Room WALC 1055'],
    ['Zarathustra', null],
    ['Zarathustra', ''],
  ])('skips "%s" (%s)', (title, description) => {
    expect(toEventItem(ev(title, description), 'https://b')).toBeNull();
  });
});
