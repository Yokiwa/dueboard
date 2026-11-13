import { describe, it, expect } from 'vitest';
import { classifyEvent, toEventItem, toMeeting } from '../../src/connectors/brightspace/map';

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

// Issue #29: class meetings posted in the calendar ("Lec21") are not work; they go to the calendar only.
describe('class meetings vs work (issue #29)', () => {
  const B = 'https://purdue.brightspace.com';
  const timed = (Title: string, start: string | null, end: string | null, extra: Record<string, unknown> = {}) => ({
    CalendarEventId: 7,
    OrgUnitId: 2,
    Title,
    Description: null as string | null,
    StartDateTime: start,
    EndDateTime: end,
    AssociatedEntity: null,
    ...extra,
  });
  const S = '2026-11-16T14:30:00.000Z';
  const E = '2026-11-16T15:20:00.000Z';

  it('Lec21 with a reading in its description is a meeting, not work', () => {
    const e = timed('Lec21', S, E, { Description: 'Read Ch. 5 pg. 121-139' });
    expect(classifyEvent(e)).toBe('meeting');
    expect(toEventItem(e, B)).toBeNull();
    expect(toMeeting(e, B)).toEqual({ source: 'brightspace', sourceId: 'event:7', sourceCourseId: '2', title: 'Lec21', startAt: S, endAt: E, url: `${B}/d2l/le/calendar/2` });
  });

  it.each(['LEC 22', 'Lect. 3', 'Lecture', 'Recitation 4', 'Office hours', 'Class meeting', 'Discussion section 2', 'Seminar'])('"%s" is a meeting', (t) => {
    expect(classifyEvent(timed(t, S, E))).toBe('meeting');
  });

  it('Lecture 14: Final Review is a meeting; Lecture: Midterm Exam is an exam; Lecture 5 Quiz is work', () => {
    expect(classifyEvent(timed('Lecture 14: Final Review', S, E))).toBe('meeting');
    expect(toEventItem(timed('Lecture: Midterm Exam', S, E), B)?.type).toBe('exam');
    expect(toEventItem(timed('Lecture 5 Quiz', S, E), B)?.type).toBe('event');
  });

  it('a 50-minute event without a deadline word is a meeting', () => {
    expect(classifyEvent(timed('Zarathustra discussion', S, E))).toBe('meeting');
  });

  it('timed work stays work: an exam evening, a presentation, a deadline at one instant', () => {
    expect(toEventItem(timed('Midterm Exam 2', '2026-11-17T00:00:00.000Z', '2026-11-17T02:00:00.000Z'), B)?.type).toBe('exam');
    expect(toEventItem(timed('Project presentation', '2026-11-16T15:30:00.000Z', '2026-11-16T16:20:00.000Z'), B)).not.toBeNull();
    expect(toEventItem(timed('WebAssign 14.3 due', '2026-11-17T04:59:00.000Z', '2026-11-17T04:59:00.000Z'), B)).not.toBeNull();
  });

  it('an all-day reading event stays work', () => {
    const e = timed('Zarathustra', '2026-11-13T05:00:00.000Z', '2026-11-14T04:59:00.000Z', { IsAllDayEvent: true, Description: 'Read pg. 121-139' });
    expect(classifyEvent(e)).toBe('work');
  });

  it('No class stays dropped; an event linked to a dropbox stays skipped', () => {
    expect(classifyEvent(timed('No class (Thanksgiving)', S, E))).toBe('drop');
    expect(toMeeting(timed('No class (Thanksgiving)', S, E), B)).toBeNull();
    const linked = timed('Lecture', S, E, { AssociatedEntity: { AssociatedEntityType: 'D2L.LE.Dropbox.Dropbox', AssociatedEntityId: 3 } });
    expect(classifyEvent(linked)).toBe('drop');
  });

  it('a lecture without an end lasts 50 minutes', () => {
    expect(toMeeting(timed('Lecture', S, null), B)).toMatchObject({ startAt: S, endAt: E });
  });

  it('an all-day lecture is dropped', () => {
    const e = timed('Lecture', '2026-11-16T05:00:00.000Z', '2026-11-17T04:59:00.000Z', { IsAllDayEvent: true });
    expect(classifyEvent(e)).toBe('drop');
    expect(toMeeting(e, B)).toBeNull();
  });
});
