import { describe, it, expect } from 'vitest';
import { createBrightspaceConnector } from '../../src/connectors/brightspace';
import { attachGrades } from '../../src/connectors/brightspace/map';
import type { CompletionRecord, RawItem } from '../../src/core/types';
import { createLimiter } from '../../src/connectors/limit';
import { fakeFetch, type FakeRoute } from '../helpers/fakeFetch';
import versions from '../fixtures/brightspace/versions.json';
import page1 from '../fixtures/brightspace/enrollments-page1.json';
import page2 from '../fixtures/brightspace/enrollments-page2.json';
import dropbox101 from '../fixtures/brightspace/dropbox-101.json';
import subsOne from '../fixtures/brightspace/mysubmissions-one.json';
import quizzes101 from '../fixtures/brightspace/quizzes-101.json';
import calendar from '../fixtures/brightspace/calendar.json';
import toc101 from '../fixtures/brightspace/toc-101.json';

const B = 'https://purdue.brightspace.com';
const now = () => new Date('2026-11-04T17:00:00.000Z');
const LE = `${B}/d2l/api/le/1.80`;

function routes(overrides: Record<string, FakeRoute | (() => FakeRoute | Promise<FakeRoute>)> = {}) {
  return {
    [`${B}/d2l/api/versions/`]: { body: versions },
    [`${B}/d2l/api/lp/1.47/enrollments/myenrollments/?orgUnitTypeId=3&bookmark=BM1`]: { body: page2 },
    [`${B}/d2l/api/lp/1.47/enrollments/myenrollments/?orgUnitTypeId=3`]: { body: page1 },
    [`${LE}/101/dropbox/folders/`]: { body: dropbox101 },
    [`${LE}/101/dropbox/folders/7/submissions/mysubmissions/`]: { body: subsOne },
    [`${LE}/101/quizzes/`]: { body: quizzes101 },
    [`${LE}/101/content/toc`]: { body: toc101 },
    [`${LE}/102/dropbox/folders/`]: { body: [] },
    [`${LE}/102/quizzes/`]: { body: { Objects: [], Next: null } },
    [`${LE}/102/content/toc`]: { body: { Modules: [] } },
    [`${LE}/calendar/events/myEvents/`]: { body: calendar },
    ...overrides,
  };
}

const run = async (r = routes()) => {
  const f = fakeFetch(r);
  const result = await createBrightspaceConnector({ fetchImpl: f.impl, now }).fetchAll();
  return { result, calls: f.calls };
};

describe('brightspace connector', () => {
  it('pages through enrollments and drops ended courses', async () => {
    const { result, calls } = await run();
    expect(calls.some((c) => c.includes('bookmark=BM1'))).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.courses).toEqual([
      { source: 'brightspace', sourceCourseId: '101', name: 'CS 18000-LEC Fall 2026', code: 'CS 18000', url: `${B}/d2l/home/101`, start: '2026-08-20T04:00:00.000Z', end: '2026-12-20T04:59:00.000Z' },
      { source: 'brightspace', sourceCourseId: '102', name: 'MA 26100 Multivariate Calculus', code: 'MA 26100', url: `${B}/d2l/home/102`, start: null, end: null },
    ]);
    expect(result.partial).toEqual([]);
  });

  it('uses latest lp/le versions from /versions/', async () => {
    const { calls } = await run();
    expect(calls.some((c) => c.startsWith(`${B}/d2l/api/lp/1.47/`))).toBe(true);
    expect(calls.some((c) => c.startsWith(`${B}/d2l/api/le/1.80/`))).toBe(true);
  });

  it('maps dropbox folders to assignment items with submit url and submitted flag', async () => {
    const { result, calls } = await run();
    if (!result.ok) throw new Error('expected ok');
    const p3 = result.items.find((i) => i.sourceItemId === 'dropbox:7');
    expect(p3).toEqual({
      source: 'brightspace',
      sourceItemId: 'dropbox:7',
      sourceCourseId: '101',
      title: 'Project 3',
      type: 'assignment',
      dueAt: '2026-11-05T04:59:00.000Z',
      url: `${B}/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=101&db=7`,
      submitted: true,
      submissionKnown: true,
    });
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:8')?.submitted).toBe(false);
    expect(calls.some((c) => c.includes('/folders/8/submissions'))).toBe(false); // due beyond 30 days
    expect(calls.some((c) => c.includes('/folders/9/submissions'))).toBe(false); // no due date
    expect(result.items.some((i) => i.sourceItemId === 'dropbox:10')).toBe(false); // hidden
  });

  it('DueDate null → dueAt null', async () => {
    const { result } = await run();
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:9')?.dueAt).toBeNull();
  });

  it('maps quizzes', async () => {
    const { result } = await run();
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'quiz:31')).toMatchObject({
      type: 'quiz',
      title: 'Quiz 6',
      dueAt: '2026-11-08T04:59:00.000Z',
      url: `${B}/d2l/lms/quizzing/user/quiz_summary.d2l?ou=101&qi=31`,
    });
    expect(result.items.some((i) => i.sourceItemId === 'quiz:32')).toBe(false);
  });

  it('maps calendar events with EndDateTime ?? StartDateTime, keeping only deadline-like events of active courses', async () => {
    const { result, calls } = await run();
    if (!result.ok) throw new Error('expected ok');
    const events = result.items.filter((i) => i.sourceItemId.startsWith('event:'));
    expect(events.map((e) => e.sourceItemId).sort()).toEqual(['event:501', 'event:504', 'event:506']);
    expect(events.find((e) => e.sourceItemId === 'event:501')).toMatchObject({
      sourceCourseId: '102',
      type: 'event',
      dueAt: '2026-11-06T04:59:00.000Z',
      url: `${B}/d2l/le/calendar/102`,
    });
    expect(events.find((e) => e.sourceItemId === 'event:504')).toMatchObject({ type: 'exam', dueAt: '2026-11-12T23:00:00.000Z' });
    // Issue #19: a reading posted as a plain event titled after the text, the work only in its description.
    expect(events.find((e) => e.sourceItemId === 'event:506')).toMatchObject({ sourceCourseId: '102', title: 'Zarathustra', type: 'event', dueAt: '2026-11-14T04:59:00.000Z' });
    expect(calls.find((c) => c.includes('myEvents'))).toContain('orgUnitIdsCSV=101,102');
  });

  it('collects toc topic links recursively', async () => {
    const { result } = await run();
    if (!result.ok) throw new Error('expected ok');
    expect(result.links.map((l) => l.title).sort()).toEqual(['Ed Discussion', 'Syllabus', 'zyBooks']);
    expect(result.links.every((l) => l.sourceCourseId === '101' && l.source === 'brightspace')).toBe(true);
  });

  it('returns not_logged_in on 401', async () => {
    const { result } = await run(routes({ [`${B}/d2l/api/versions/`]: { status: 401, body: '' } }));
    expect(result).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('returns not_logged_in when redirected to the login page', async () => {
    const { result } = await run(
      routes({ [`${B}/d2l/api/versions/`]: { body: '<html></html>', redirectedTo: `${B}/d2l/login?target=x` } }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('returns network on 500', async () => {
    const { result } = await run(routes({ [`${B}/d2l/api/versions/`]: { status: 500, body: 'oops' } }));
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });

  it('one course failing does not fail whole result', async () => {
    const { result } = await run(routes({ [`${LE}/102/dropbox/folders/`]: { status: 500, body: 'oops' } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.partial).toEqual(['102']);
    expect(result.courses).toHaveLength(2);
    expect(result.items.some((i) => i.sourceItemId === 'dropbox:7')).toBe(true);
  });

  it('never more than 4 concurrent requests', async () => {
    let active = 0;
    let max = 0;
    const slow = (body: unknown) => async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { body };
    };
    const many = { PagingInfo: { Bookmark: '', HasMoreItems: false }, Items: Array.from({ length: 6 }, (_, i) => ({
      OrgUnit: { Id: 200 + i, Name: `CS 1${i}000`, Code: 'X' }, Access: { IsActive: true, CanAccess: true, StartDate: null, EndDate: null },
    })) };
    const r: Record<string, () => Promise<FakeRoute>> = {
      [`${B}/d2l/api/versions/`]: slow(versions),
      [`${B}/d2l/api/lp/1.47/enrollments/myenrollments/?orgUnitTypeId=3`]: slow(many),
      [`${LE}/calendar/events/myEvents/`]: slow({ Objects: [], Next: null }),
    };
    for (let i = 0; i < 6; i++) {
      r[`${LE}/${200 + i}/dropbox/folders/`] = slow([]);
      r[`${LE}/${200 + i}/quizzes/`] = slow({ Objects: [], Next: null });
      r[`${LE}/${200 + i}/content/toc`] = slow({ Modules: [] });
    }
    const f = fakeFetch(r);
    const result = await createBrightspaceConnector({ fetchImpl: f.impl, now }).fetchAll();
    expect(result.ok).toBe(true);
    expect(max).toBeLessThanOrEqual(4);
    expect(max).toBeGreaterThan(1);
  });
});

describe('createLimiter', () => {
  it('runs at most max tasks at once and returns each result', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let max = 0;
    const task = (v: number) => limit(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return v;
    });
    await expect(Promise.all([1, 2, 3, 4, 5].map(task))).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(max).toBe(2);
  });

  it('a rejected task frees its slot', async () => {
    const limit = createLimiter(1);
    await expect(limit(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('final review regressions (brightspace)', () => {
  it('one failing endpoint keeps the rest of that course (I1)', async () => {
    const { result } = await run(routes({ [`${LE}/101/content/toc`]: { status: 500, body: '' } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.some((i) => i.sourceItemId === 'dropbox:7')).toBe(true);
    expect(result.items.some((i) => i.sourceItemId === 'quiz:31')).toBe(true);
    expect(result.partial).toEqual(['101']);
  });

  it('a failed mySubmissions request records nothing (I1)', async () => {
    const { result } = await run(routes({ [`${LE}/101/dropbox/folders/7/submissions/mysubmissions/`]: { status: 404, body: '' } }));
    if (!result.ok) throw new Error('expected ok');
    const it7 = result.items.find((i) => i.sourceItemId === 'dropbox:7');
    expect(it7?.submitted).toBe(false);
    expect(it7?.submissionKnown).toBeUndefined();
    expect(result.partial).toEqual([]);
  });

  it('a 403 on one course marks it partial instead of asking to log in (I2)', async () => {
    const { result } = await run(routes({ [`${LE}/102/quizzes/`]: { status: 403, body: '' } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.partial).toEqual(['102']);
  });

  it('a 403 on enrollments still means not logged in (I2)', async () => {
    const { result } = await run(routes({ [`${B}/d2l/api/lp/1.47/enrollments/myenrollments/?orgUnitTypeId=3`]: { status: 403, body: '' } }));
    expect(result).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('falls back to the end date when no due date is set (I3)', async () => {
    const { result } = await run(
      routes({
        [`${LE}/102/dropbox/folders/`]: { body: [{ Id: 70, Name: 'Essay', DueDate: null, IsHidden: false, Availability: { StartDate: null, EndDate: '2026-11-10T04:59:00.000Z' } }] },
        [`${LE}/102/quizzes/`]: { body: { Objects: [{ QuizId: 80, Name: 'Quiz 7', IsActive: true, DueDate: null, StartDate: null, EndDate: '2026-11-11T04:59:00.000Z' }], Next: null } },
      }),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:70')?.dueAt).toBe('2026-11-10T04:59:00.000Z');
    expect(result.items.find((i) => i.sourceItemId === 'quiz:80')?.dueAt).toBe('2026-11-11T04:59:00.000Z');
  });
});

describe('calendar errors', () => {
  it('a 403 on the calendar does not fail the sync (I2)', async () => {
    const { result } = await run(routes({ [`${LE}/calendar/events/myEvents/`]: { status: 403, body: '' } }));
    expect(result.ok).toBe(true);
  });
});

describe('calendar event links (Open → 500 bug)', () => {
  const calendarWith = (ev: Record<string, unknown>) =>
    routes({ [`${LE}/calendar/events/myEvents/`]: { body: { Objects: [{ CalendarEventId: 900, OrgUnitId: 102, Title: 'Reflection after Exam 2 (1 pt EC)', StartDateTime: '2026-11-07T04:59:00.000Z', EndDateTime: '2026-11-07T04:59:00.000Z', IsAllDayEvent: false, ...ev }], Next: null } } });

  it('uses the linked content page when the event belongs to a content topic', async () => {
    const { result } = await run(
      calendarWith({ AssociatedEntity: { AssociatedEntityType: 'D2L.LE.Content.ContentObject.TopicCO', AssociatedEntityId: 22268352, Link: '/d2l/le/content/102/viewContent/22268352/View' } }),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'event:900')?.url).toBe(`${B}/d2l/le/content/102/viewContent/22268352/View`);
  });

  it("falls back to the event's own view url, then to the course calendar — never a hand-built detailsview url", async () => {
    const withView = await run(calendarWith({ AssociatedEntity: null, CalendarEventViewUrl: `${B}/d2l/le/calendar/102/event/900/detailsview#900` }));
    if (!withView.result.ok) throw new Error('expected ok');
    expect(withView.result.items.find((i) => i.sourceItemId === 'event:900')?.url).toBe(`${B}/d2l/le/calendar/102/event/900/detailsview#900`);

    const bare = await run(calendarWith({ AssociatedEntity: null }));
    if (!bare.result.ok) throw new Error('expected ok');
    expect(bare.result.items.find((i) => i.sourceItemId === 'event:900')?.url).toBe(`${B}/d2l/le/calendar/102`);
  });

  it('ignores a non-http link from the API', async () => {
    const { result } = await run(calendarWith({ AssociatedEntity: { AssociatedEntityType: 'X', AssociatedEntityId: 1, Link: 'javascript:alert(1)' } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'event:900')?.url).toBe(`${B}/d2l/le/calendar/102`);
  });
});

describe('content topics without a url', () => {
  it('link to the topic page so platform launches (e.g. WileyPLUS) still get a button', async () => {
    const { result } = await run(
      routes({ [`${LE}/102/content/toc`]: { body: { Modules: [{ Title: 'Homework', Modules: [], Topics: [{ TopicId: 77, Title: 'WileyPLUS', Url: null, TypeIdentifier: 'Link' }] }] } } }),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.links.find((l) => l.title === 'WileyPLUS')).toEqual({ source: 'brightspace', sourceCourseId: '102', title: 'WileyPLUS', url: `${B}/d2l/le/content/102/viewContent/77/View` });
  });
});

describe('homework launches in course content become items', () => {
  const toc = {
    Modules: [{ Title: 'MODULE 3', Modules: [{ Title: 'HOMEWORK 11', Modules: [], Topics: [
      { TopicId: 501, Title: 'PHYS 172H - HW11 - FA26', Url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rCode=ABC-130', TypeIdentifier: 'Link' },
    ] }], Topics: [
      { TopicId: 502, Title: 'Physics 172H - HW10 - FA 26', Url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rCode=ABC-130', TypeIdentifier: 'Link', DueDate: '2026-11-04T04:59:00.000Z' },
      { TopicId: 503, Title: 'Copy of HW01 for study purposes', Url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rCode=ABC-1', TypeIdentifier: 'Link' },
      { TopicId: 504, Title: 'HW 4 solutions', Url: '/content/enforced/102/hw4-solutions.pdf', TypeIdentifier: 'File' },
      { TopicId: 505, Title: 'Wiley Course Resources - LTI 1.3', Url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rcode=ABC-9', TypeIdentifier: 'Link' },
    ] }],
  };

  it('LTI launches titled like homework (HW + number) become assignments that open their content page', async () => {
    const { result } = await run(routes({ [`${LE}/102/content/toc`]: { body: toc } }));
    if (!result.ok) throw new Error('expected ok');
    const topics = result.items.filter((i) => i.sourceItemId.startsWith('topic:'));
    expect(topics.map((i) => i.title).sort()).toEqual(['PHYS 172H - HW11 - FA26', 'Physics 172H - HW10 - FA 26']);
    expect(topics.find((i) => i.sourceItemId === 'topic:501')).toEqual({
      source: 'brightspace', sourceItemId: 'topic:501', sourceCourseId: '102', title: 'PHYS 172H - HW11 - FA26',
      type: 'assignment', dueAt: null, url: `${B}/d2l/le/content/102/viewContent/501/View`, submitted: false,
      launchUrl: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rCode=ABC-130`,
    });
    expect(topics.find((i) => i.sourceItemId === 'topic:502')!.dueAt).toBe('2026-11-04T04:59:00.000Z');
  });
});

describe('wider homework detection in course content', () => {
  const lti = (n: number) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rCode=ABC-${n}`;
  const topic = (id: number, Title: string, Url = lti(id)) => ({ TopicId: id, Title, Url, TypeIdentifier: 'Link' });
  const toc = {
    Modules: [
      { Title: 'Week 5', Modules: [], Topics: [
        topic(1, 'Problem Set 3'),
        topic(2, 'Assignment 4: Vectors'),
        topic(3, 'Lab 5 Pre-lab'),
        topic(4, 'Chapter 6 Quiz'),
        topic(5, 'Project #2 checkpoint'),
        topic(6, 'Worksheet 7'),
        topic(7, 'Lecture 12 video'),
        topic(8, 'Lab 5 instructions', '/content/enforced/102/lab5.pdf'),
        topic(9, 'Practice Quiz 6'),
        topic(10, 'Week 5 slides'),
      ] },
      { Title: 'Homework', Modules: [{ Title: 'Unit 2', Modules: [], Topics: [topic(20, 'Kinematics in 2D'), topic(21, 'Access Pearson'), topic(22, 'Unit 2 solutions')] }], Topics: [topic(23, 'Energy and work')] },
      { Title: 'Course Tools', Modules: [], Topics: [topic(30, 'Kaltura Media'), topic(31, 'Wiley Course Resources - LTI 1.3')] },
    ],
  };

  it('picks up launches titled like work (assignment, problem set, lab, quiz, project, worksheet + number) and launches inside Homework / Assignments modules', async () => {
    const { result } = await run(routes({ [`${LE}/102/content/toc`]: { body: toc } }));
    if (!result.ok) throw new Error('expected ok');
    const titles = result.items.filter((i) => i.sourceItemId.startsWith('topic:')).map((i) => i.title).sort();
    expect(titles).toEqual([
      'Assignment 4: Vectors',
      'Chapter 6 Quiz',
      'Energy and work',
      'Kinematics in 2D',
      'Lab 5 Pre-lab',
      'Problem Set 3',
      'Project #2 checkpoint',
      'Worksheet 7',
    ]);
  });
});

describe('syllabus sources in course content', () => {
  it('lists syllabus files and launches found in each course', async () => {
    const toc = { Modules: [{ Title: 'Start Here', Modules: [], Topics: [
      { TopicId: 9, Title: 'Course Syllabus', Url: '/content/enforced/102-MA/syllabus.pdf', TypeIdentifier: 'File', LastModifiedDate: '2026-08-20T00:00:00.000Z' },
      { TopicId: 10, Title: 'Lecture 1', Url: '/content/enforced/102-MA/l1.pdf', TypeIdentifier: 'File' },
    ] }] };
    const { result } = await run(routes({ [`${LE}/102/content/toc`]: { body: toc } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.syllabusSources).toEqual([
      { ou: '101', kind: 'pdf', url: `${B}/content/enforced/101-CS18000/syllabus.pdf`, title: 'Syllabus', modified: null },
      { ou: '102', kind: 'pdf', url: `${B}/content/enforced/102-MA/syllabus.pdf`, title: 'Course Syllabus', modified: '2026-08-20T00:00:00.000Z' },
    ]);
  });
});

describe('brightspace gradebook scores', () => {
  const item = (id: string, title: string): RawItem => ({ source: 'brightspace', sourceItemId: id, sourceCourseId: '101', title, type: 'assignment', dueAt: null, url: 'u', submitted: true });
  const grade = (id: string, name: string, n: number | null, d: number | null, shown: string | null = null) =>
    ({ GradeObjectIdentifier: id, GradeObjectName: name, PointsNumerator: n, PointsDenominator: d, DisplayedGrade: shown });
  const pts = { text: '18/20', earned: 18, possible: 20, from: 'Brightspace' };

  it('matches by grade item id even when names differ', () => {
    const items = [item('dropbox:7', 'Project 3')];
    attachGrades(items, [grade('55', 'Unit project', 18, 20)], new Map([['dropbox:7', '55']]));
    expect(items[0]!.score).toEqual(pts);
  });
  it('matches a unique normalized name', () => {
    const items = [item('quiz:1', 'hw3')];
    attachGrades(items, [grade('9', 'HW 3', 18, 20)], new Map());
    expect(items[0]!.score).toEqual(pts);
  });
  it('gives no score for ambiguous names', () => {
    const items = [item('a', 'Homework 1'), item('b', 'Homework 1')];
    attachGrades(items, [grade('9', 'Homework 1', 18, 20)], new Map());
    expect(items.every((i) => !i.score)).toBe(true);
    const one = [item('a', 'Homework 1')];
    attachGrades(one, [grade('9', 'Homework 1', 18, 20), grade('10', 'Homework 1', 5, 20)], new Map());
    expect(one[0]!.score).toBeUndefined();
  });
  it('uses the displayed grade when there are no points, and ignores empty grades', () => {
    const items = [item('a', 'Essay'), item('b', 'Lab')];
    attachGrades(items, [grade('1', 'Essay', null, null, 'A-'), grade('2', 'Lab', null, null, null)], new Map());
    expect(items[0]!.score).toEqual({ text: 'A-', from: 'Brightspace' });
    expect(items[1]!.score).toBeUndefined();
  });

  it('uses a displayed grade only as a percentage, a letter or x / y', () => {
    const shownAs = (shown: string) => {
      const items = [item('a', 'Essay')];
      attachGrades(items, [grade('1', 'Essay', null, null, shown)], new Map());
      return items[0]!.score;
    };
    expect(shownAs('92 %')).toEqual({ text: '92%', from: 'Brightspace' });
    expect(shownAs('92%')).toEqual({ text: '92%', from: 'Brightspace' });
    expect(shownAs('87.50 %')?.text).toBe('87.5%');
    expect(shownAs('B+')).toEqual({ text: 'B+', from: 'Brightspace' });
    expect(shownAs('F')?.text).toBe('F');
    expect(shownAs('18 / 20')).toEqual({ text: '18/20', earned: 18, possible: 20, from: 'Brightspace' });
    for (const bad of ['-', '--', 'Excellent work', 'Pass', 'G', 'A+-', '18 / 0', '92% late']) expect(shownAs(bad)).toBeUndefined();
  });

  it('an id-matched grade is not also attached to a same-named item', () => {
    const items = [item('dropbox:7', 'Project 3'), item('quiz:1', 'Unit project')];
    attachGrades(items, [grade('55', 'Unit project', 18, 20)], new Map([['dropbox:7', '55']]));
    expect(items[0]!.score).toEqual(pts);
    expect(items[1]!.score).toBeUndefined();
  });
  it('an ambiguous grade id gives no score and no name fallback', () => {
    const items = [item('dropbox:7', 'Project 3')];
    attachGrades(items, [grade('55', 'Project 3', 18, 20), grade('55', 'Other', 1, 20)], new Map([['dropbox:7', '55']]));
    expect(items[0]!.score).toBeUndefined();
  });
  it('keeps a real zero score', () => {
    const items = [item('a', 'Lab 1')];
    attachGrades(items, [grade('1', 'Lab 1', 0, 20)], new Map());
    expect(items[0]!.score).toEqual({ text: '0/20', earned: 0, possible: 20, from: 'Brightspace' });
  });
  it('a 404 on the grades request behaves like a 403', async () => {
    const { result } = await run(routes({ [`${LE}/101/grades/values/myGradeValues/`]: { status: 404, body: {} } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.partial).toEqual([]);
    expect(result.items.some((i) => i.score)).toBe(false);
  });
  it('a failing grades request leaves items alone and the course not partial', async () => {
    const { result } = await run(routes({ [`${LE}/101/grades/values/myGradeValues/`]: { status: 403, body: {} } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.partial).toEqual([]);
    expect(result.items.some((i) => i.score)).toBe(false);
  });
  it('attaches fetched grades to the connector items', async () => {
    const g = [grade('55', 'Anything', 18, 20)];
    const { result } = await run(routes({ [`${LE}/101/grades/values/myGradeValues/`]: { body: g } }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:7')?.score?.text).toBe('18/20');
  });
});

describe('brightspace submissions for the whole term', () => {
  const DAY = 86_400_000;
  const folder = (id: number, daysAgo: number) => ({ Id: id, Name: `HW ${id}`, DueDate: new Date(now().getTime() - daysAgo * DAY).toISOString(), IsHidden: false });
  // Course 101: folders 1..30, due 10..39 days ago; course 102: folders 101..120, due 10.5..29.5 days ago.
  const f101 = Array.from({ length: 30 }, (_, i) => folder(i + 1, 10 + i));
  const f102 = Array.from({ length: 20 }, (_, i) => folder(101 + i, 10.5 + i));
  const doneIds = [1, 2, 3, 101, 102];
  const completion: Record<string, CompletionRecord> = Object.fromEntries(doneIds.map((id) => [`brightspace:dropbox:${id}`, { state: 'done', checkedAt: 'x' }]));
  const askedIds = (calls: string[]) => calls.filter((c) => c.includes('/mysubmissions/')).map((c) => Number(/folders\/(\d+)\//.exec(c)![1]));

  it('asks mySubmissions for past-due folders not known done, most recently due first, at most 40 beyond the usual window', async () => {
    const f = fakeFetch(routes({ [`${LE}/101/dropbox/folders/`]: { body: f101 }, [`${LE}/102/dropbox/folders/`]: { body: f102 } }));
    await createBrightspaceConnector({ fetchImpl: f.impl, now, completion: async () => completion }).fetchAll();
    const asked = askedIds(f.calls);
    const expected = [...f101, ...f102]
      .filter((x) => !doneIds.includes(x.Id))
      .sort((a, b) => Date.parse(b.DueDate) - Date.parse(a.DueDate))
      .slice(0, 40)
      .map((x) => x.Id);
    expect(asked.length).toBe(40);
    expect(new Set(asked)).toEqual(new Set(expected));
  });

  it('does not ask about folders due before the term (the course start, or the semester guess when Brightspace has none)', async () => {
    // Course 101 runs from Aug 20; course 102 has no dates (the guess starts Aug 1). Now is Nov 4.
    const f = fakeFetch(routes({ [`${LE}/101/dropbox/folders/`]: { body: [folder(1, 12), folder(2, 100)] }, [`${LE}/102/dropbox/folders/`]: { body: [folder(3, 120), folder(4, 30)] } }));
    await createBrightspaceConnector({ fetchImpl: f.impl, now }).fetchAll();
    expect(askedIds(f.calls).sort()).toEqual([1, 4]);
  });

  it('without completion records it still asks at most 40 past-due folders', async () => {
    const f = fakeFetch(routes({ [`${LE}/101/dropbox/folders/`]: { body: f101 }, [`${LE}/102/dropbox/folders/`]: { body: f102 } }));
    await createBrightspaceConnector({ fetchImpl: f.impl, now }).fetchAll();
    expect(askedIds(f.calls).length).toBe(40);
  });

  it('a folder asked and answered with no submission is submissionKnown and not submitted; one with a submission is submitted', async () => {
    const r = routes({
      [`${LE}/101/dropbox/folders/`]: { body: [folder(1, 12), folder(2, 13)] },
      [`${LE}/101/dropbox/folders/1/submissions/mysubmissions/`]: { body: [] },
      [`${LE}/101/dropbox/folders/2/submissions/mysubmissions/`]: { body: [{ Submissions: [{ Id: 1 }], CompletionDate: null }] },
    });
    const { result } = await run(r);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:1')).toMatchObject({ submitted: false, submissionKnown: true });
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:2')).toMatchObject({ submitted: true, submissionKnown: true });
  });

  it('a folder not asked carries no answer', async () => {
    const f = fakeFetch(routes({ [`${LE}/101/dropbox/folders/`]: { body: [folder(1, 12)] } }));
    const result = await createBrightspaceConnector({ fetchImpl: f.impl, now, completion: async () => ({ 'brightspace:dropbox:1': { state: 'done', checkedAt: 'x' } }) }).fetchAll();
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'dropbox:1')?.submissionKnown).toBeUndefined();
  });

  it('gradebook: a quiz gets its score by GradeItemId', async () => {
    const r = routes({
      [`${LE}/101/quizzes/`]: { body: { Objects: [{ QuizId: 31, Name: 'Quiz 6', IsActive: true, DueDate: '2026-11-01T04:59:00.000Z', GradeItemId: 77 }], Next: null } },
      [`${LE}/101/grades/values/myGradeValues/`]: { body: [{ GradeObjectIdentifier: '77', GradeObjectName: 'Chapter quiz', PointsNumerator: 9, PointsDenominator: 10, DisplayedGrade: null }] },
    });
    const { result } = await run(r);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.find((i) => i.sourceItemId === 'quiz:31')?.score).toEqual({ text: '9/10', earned: 9, possible: 10, from: 'Brightspace' });
  });
});
