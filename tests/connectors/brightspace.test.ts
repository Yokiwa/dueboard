import { describe, it, expect } from 'vitest';
import { createBrightspaceConnector } from '../../src/connectors/brightspace';
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
      { source: 'brightspace', sourceCourseId: '101', name: 'CS 18000-LEC Fall 2026', code: 'CS 18000', url: `${B}/d2l/home/101` },
      { source: 'brightspace', sourceCourseId: '102', name: 'MA 26100 Multivariate Calculus', code: 'MA 26100', url: `${B}/d2l/home/102` },
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
    expect(events.map((e) => e.sourceItemId).sort()).toEqual(['event:501', 'event:504']);
    expect(events.find((e) => e.sourceItemId === 'event:501')).toMatchObject({
      sourceCourseId: '102',
      type: 'event',
      dueAt: '2026-11-06T04:59:00.000Z',
      url: `${B}/d2l/le/calendar/102/event/501/detailsview`,
    });
    expect(events.find((e) => e.sourceItemId === 'event:504')).toMatchObject({ type: 'exam', dueAt: '2026-11-12T23:00:00.000Z' });
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
