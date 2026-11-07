import { describe, it, expect } from 'vitest';
import { syllabusSuggestions, unreadableSyllabi } from '../../src/core/syllabusSuggestions';
import { buildDashboard } from '../../src/core/dashboard';
import { migrate } from '../../src/storage/store';
import type { RawItem, StoreShape, SyllabusRow } from '../../src/core/types';

const now = new Date(2026, 9, 1, 12);
const B = 'https://purdue.brightspace.com';
const row = (title: string, m: number, d: number, allDay = false): SyllabusRow => ({ title, dueAt: new Date(2026, m - 1, d, allDay ? 0 : 23, allDay ? 0 : 59).toISOString(), allDay, excerpt: `${m}/${d} | ${title}` });
const quiz = (title: string, m: number, d: number): RawItem => ({ source: 'brightspace', sourceItemId: `quiz:${title}`, sourceCourseId: '1', title, type: 'quiz', dueAt: new Date(2026, m - 1, d, 20, 0).toISOString(), url: 'u', submitted: false });
const store = (rows: SyllabusRow[], items: RawItem[] = [], extra: Record<string, unknown> = {}): StoreShape =>
  migrate({
    snapshots: { brightspace: { syncedAt: 'x', partial: [], links: [], items, courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA 16100', code: 'MA 16100', url: `${B}/d2l/home/1` }] } },
    syllabus: { '1': { source: `${B}/s.pdf`, kind: 'pdf', readAt: now.toISOString(), modified: null, rows } },
    ...extra,
  });
const suggest = (s: StoreShape) => syllabusSuggestions(s, buildDashboard(s, now), now);

describe('syllabusSuggestions', () => {
  it('lists syllabus rows for the course, by date, with where they came from', () => {
    const got = suggest(store([row('Project 1', 11, 3), row('Exam 2', 10, 14, true)]));
    expect(got.map((s) => s.title)).toEqual(['Exam 2', 'Project 1']);
    expect(got[0]).toMatchObject({ courseId: 'brightspace:1', allDay: true, source: 'Syllabus PDF', excerpt: '10/14 | Exam 2' });
    expect(got[0]!.key).toBe(`1|exam2|${row('Exam 2', 10, 14, true).dueAt.slice(0, 10)}`);
  });

  it('drops a row that matches an existing item on the same day', () => {
    expect(suggest(store([row('Exam 2', 10, 14, true)], [quiz('Exam 2', 10, 14)]))).toEqual([]);
  });

  it('keeps a row whose matching item is on another day', () => {
    expect(suggest(store([row('Exam 2', 10, 14, true)], [quiz('Exam 2', 10, 21)]))).toHaveLength(1);
  });

  it('drops hidden and past rows', () => {
    const s = store([row('Exam 2', 10, 14, true), row('Quiz 1', 9, 10)]);
    s.userState.syllabusHidden[suggest(s)[0]!.key] = true;
    expect(suggest(s)).toEqual([]);
  });

  it('shows nothing when syllabus suggestions are off', () => {
    expect(suggest(store([row('Exam 2', 10, 14, true)], [], { settings: { visits: 'auto', syllabus: false } }))).toEqual([]);
  });
});

describe('unreadableSyllabi', () => {
  it('names courses whose syllabus could not be read', () => {
    const s = store([]);
    s.syllabus['1']!.error = 'unreadable';
    expect(unreadableSyllabi(s, buildDashboard(s, now))).toEqual(['brightspace:1']);
  });
});
