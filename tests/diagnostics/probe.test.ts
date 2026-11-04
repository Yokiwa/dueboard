import { describe, it, expect } from 'vitest';
import { probe, collectFixtures } from '../../src/diagnostics/probe';
import { fakeFetch } from '../helpers/fakeFetch';

const BS = 'https://purdue.brightspace.com';
const GS = 'https://www.gradescope.com';
const versions = [
  { ProductCode: 'lp', LatestVersion: '1.47', SupportedVersions: ['1.46', '1.47'] },
  { ProductCode: 'le', LatestVersion: '1.80', SupportedVersions: ['1.79', '1.80'] },
];

describe('probe', () => {
  it('reports ok when both platforms answer while logged in', async () => {
    const { impl } = fakeFetch({
      [`${BS}/d2l/api/versions/`]: { body: versions },
      [`${GS}/account`]: { body: '<div class="courseList"><a class="courseBox" href="/courses/1"></a></div>' },
    });
    const r = await probe(impl);
    expect(r.brightspace.ok).toBe(true);
    expect(r.gradescope.ok).toBe(true);
  });

  it('reports not ok with redirect target when sent to a login page', async () => {
    const { impl } = fakeFetch({
      [`${BS}/d2l/api/versions/`]: { body: '<html>login</html>', redirectedTo: `${BS}/d2l/login` },
      [`${GS}/account`]: { body: '<html>Log In</html>', redirectedTo: `${GS}/login` },
    });
    const r = await probe(impl);
    expect(r.brightspace).toMatchObject({ ok: false, redirectedTo: `${BS}/d2l/login` });
    expect(r.gradescope).toMatchObject({ ok: false, redirectedTo: `${GS}/login` });
  });

  it('reports not ok when fetch throws', async () => {
    const r = await probe((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    expect(r.brightspace.ok).toBe(false);
    expect(r.brightspace.note).toContain('Failed to fetch');
  });
});

describe('collectFixtures', () => {
  it('collects one sample of each endpoint and scrubs the user name', async () => {
    const { impl, calls } = fakeFetch({
      [`${BS}/d2l/api/versions/`]: { body: versions },
      [`${BS}/d2l/api/lp/1.47/users/whoami`]: {
        body: { Identifier: '999', FirstName: 'Alex', LastName: 'Doe', UniqueName: 'adoe', ProfileIdentifier: 'p1' },
      },
      [`${BS}/d2l/api/lp/1.47/enrollments/myenrollments/`]: {
        body: {
          PagingInfo: { Bookmark: '', HasMoreItems: false },
          Items: [{ OrgUnit: { Id: 42, Name: 'CS 18000 Alex Doe section', Code: 'X' }, Access: { IsActive: true, CanAccess: true } }],
        },
      },
      [`${BS}/d2l/api/le/1.80/42/dropbox/folders/`]: { body: [{ Id: 7, Name: 'Project 3', DueDate: '2026-11-05T04:59:00.000Z' }] },
      [`${BS}/d2l/api/le/1.80/42/dropbox/folders/7/submissions/mysubmissions/`]: { body: [] },
      [`${BS}/d2l/api/le/1.80/42/quizzes/`]: { body: { Objects: [], Next: null } },
      [`${BS}/d2l/api/le/1.80/calendar/events/myEvents/`]: { body: { Objects: [], Next: null } },
      [`${BS}/d2l/api/le/1.80/42/content/toc`]: { body: { Modules: [] } },
      [`${GS}/account`]: { body: '<a class="courseBox" href="/courses/5">Alex Doe</a>' },
      [`${GS}/courses/5`]: { body: '<table id="assignments-student-table"></table>' },
    });
    const out = await collectFixtures(impl);
    expect(Object.keys(out.brightspace).sort()).toEqual(
      ['calendar', 'dropbox', 'enrollments', 'mysubmissions', 'quizzes', 'toc', 'versions'].sort(),
    );
    expect(Object.keys(out.gradescope).sort()).toEqual(['account', 'course']);
    expect(JSON.stringify(out)).not.toContain('Alex Doe');
    expect(JSON.stringify(out)).not.toContain('adoe');
    expect(out.errors).toEqual([]);
    expect(calls.some((c) => c.includes('orgUnitIdsCSV=42'))).toBe(true);
  });

  it('records an error per failed endpoint instead of aborting', async () => {
    const { impl } = fakeFetch({ [`${BS}/d2l/api/versions/`]: { status: 500, body: 'oops' } });
    const out = await collectFixtures(impl);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
