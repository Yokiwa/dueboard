import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { domGradescopeParser, GradescopeParseError } from '../../src/connectors/gradescope/parse';
import { createGradescopeConnector } from '../../src/connectors/gradescope';
import { fakeFetch } from '../helpers/fakeFetch';

const G = 'https://www.gradescope.com';
const home = readFileSync('tests/fixtures/gradescope/home.html', 'utf8');
const course = readFileSync('tests/fixtures/gradescope/course.html', 'utf8');

describe('gradescope parser', () => {
  it('home keeps only the newest term student courses', () => {
    expect(domGradescopeParser.home(home)).toEqual([
      { source: 'gradescope', sourceCourseId: '123456', name: 'CS 180 Problem Solving and Object-Oriented Programming', code: 'CS 18000', url: `${G}/courses/123456` },
      { source: 'gradescope', sourceCourseId: '123457', name: 'PHYS 17200 Modern Mechanics', code: 'PHYS 17200', url: `${G}/courses/123457` },
    ]);
  });

  it('parse_error when home has no courseList', () => {
    expect(() => domGradescopeParser.home('<html><body>Welcome</body></html>')).toThrow(GradescopeParseError);
  });

  it('course maps rows to assignment items', () => {
    const items = domGradescopeParser.course(course, '123456');
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      source: 'gradescope',
      sourceItemId: '789',
      sourceCourseId: '123456',
      title: 'Project 3',
      type: 'assignment',
      dueAt: '2026-11-05T04:59:00.000Z',
      url: `${G}/courses/123456/assignments/789/submissions/111`,
      submitted: true,
      submissionKnown: true,
    });
    expect(items[1]).toMatchObject({ sourceItemId: '790', title: 'Lab 09 & Writeup', url: `${G}/courses/123456/assignments/790`, submitted: false });
  });

  it('picks due date not late due date', () => {
    expect(domGradescopeParser.course(course, '123456')[0]!.dueAt).toBe('2026-11-05T04:59:00.000Z');
  });

  it('No Due Date → null, falls back to course url and title hash id', () => {
    const p = domGradescopeParser.course(course, '123456')[3]!;
    expect(p).toMatchObject({ title: 'Participation', dueAt: null, url: `${G}/courses/123456`, submitted: false });
    expect(p.sourceItemId).toBe('title:participation');
  });

  it('submitted when status cell is Submitted or shows a score', () => {
    const items = domGradescopeParser.course(course, '123456');
    expect(items.map((i) => i.submitted)).toEqual([true, false, true, false]);
  });

  it('every row with a status answers "submitted or not": "Submitted", a score and "No Submission"', () => {
    const items = domGradescopeParser.course(course, '123456');
    expect(items.map((i) => i.submissionKnown)).toEqual([true, true, true, true]);
    expect(items.map((i) => i.submitted)).toEqual([true, false, true, false]);
  });

  it('a row without a status says nothing', () => {
    const html = course.replace('<div class="submissionStatus--text">Submitted', '<div class="other">');
    expect(domGradescopeParser.course(html, '123456')[0]!.submissionKnown).toBeUndefined();
  });

  it('reads the score from .submissionStatus--score, none when absent', () => {
    const items = domGradescopeParser.course(course, '123456');
    const hw = items.find((i) => i.title === 'Homework 1')!;
    expect(hw.score).toEqual({ text: '18/20', earned: 18, possible: 20, from: 'Gradescope', evidence: '18.0 / 20.0' });
    expect(items.find((i) => i.title === 'Participation')!.score).toBeUndefined();
  });

  it('no score when possible is zero', () => {
    const html = course.replace('18.0 / 20.0', '5 / 0');
    expect(domGradescopeParser.course(html, '123456').find((i) => i.title === 'Homework 1')!.score).toBeUndefined();
  });

  it.each(['- / 20.0', '1,000 / 2,000', 'Graded 11/5'])('no score for non-plain cell "%s"', (cell) => {
    const html = course.replace('18.0 / 20.0', cell);
    expect(domGradescopeParser.course(html, '123456').find((i) => i.title === 'Homework 1')!.score).toBeUndefined();
  });

  it('course page without the table throws', () => {
    expect(() => domGradescopeParser.course('<html></html>', '1')).toThrow(GradescopeParseError);
  });
});

describe('gradescope connector', () => {
  it('reads home then each course page', async () => {
    const f = fakeFetch({
      [`${G}/account`]: { body: home },
      [`${G}/courses/123456`]: { body: course },
      [`${G}/courses/123457`]: { body: '<table id="assignments-student-table"><tbody></tbody></table>' },
    });
    const r = await createGradescopeConnector({ parser: domGradescopeParser, fetchImpl: f.impl }).fetchAll();
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.courses).toHaveLength(2);
    expect(r.items).toHaveLength(4);
    expect(r.links).toEqual([]);
    expect(r.partial).toEqual([]);
  });

  it('connector returns not_logged_in when redirected to /login', async () => {
    const f = fakeFetch({ [`${G}/account`]: { body: '<form action="/login"></form>', redirectedTo: `${G}/login` } });
    const r = await createGradescopeConnector({ parser: domGradescopeParser, fetchImpl: f.impl }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('connector returns not_logged_in when the page is a login form without redirect', async () => {
    const f = fakeFetch({ [`${G}/account`]: { body: '<html><form action="/login" method="post"><input id="session_email"></form></html>' } });
    const r = await createGradescopeConnector({ parser: domGradescopeParser, fetchImpl: f.impl }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('parse_error when home has no course list', async () => {
    const f = fakeFetch({ [`${G}/account`]: { body: '<html><body>New design</body></html>' } });
    const r = await createGradescopeConnector({ parser: domGradescopeParser, fetchImpl: f.impl }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'parse_error' });
  });

  it('a failing course page marks it partial', async () => {
    const f = fakeFetch({
      [`${G}/account`]: { body: home },
      [`${G}/courses/123456`]: { body: course },
      [`${G}/courses/123457`]: { status: 500, body: '' },
    });
    const r = await createGradescopeConnector({ parser: domGradescopeParser, fetchImpl: f.impl }).fetchAll();
    if (!r.ok) throw new Error('expected ok');
    expect(r.partial).toEqual(['123457']);
    expect(r.items).toHaveLength(4);
  });
});
