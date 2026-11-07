import { describe, it, expect } from 'vitest';
import { buildDashboard, dueCounts, PALETTE, type DashboardInput } from '../../src/core/dashboard';
import type { RawCourse, RawItem, Snapshot, UserState } from '../../src/core/types';

const now = new Date('2026-11-04T12:00:00-05:00');
const iso = (s: string) => new Date(s).toISOString();

const bsCourse = (id: string, name: string, code: string | null = null): RawCourse => ({
  source: 'brightspace',
  sourceCourseId: id,
  name,
  code,
  url: `https://purdue.brightspace.com/d2l/home/${id}`,
});
const gsCourse = (id: string, name: string, code: string | null = null): RawCourse => ({
  source: 'gradescope',
  sourceCourseId: id,
  name,
  code,
  url: `https://www.gradescope.com/courses/${id}`,
});
const item = (p: Partial<RawItem> & Pick<RawItem, 'source' | 'sourceItemId' | 'sourceCourseId' | 'title'>): RawItem => ({
  type: 'assignment',
  dueAt: iso('2026-11-06T23:59:00-05:00'),
  url: `https://example.com/${p.source}/${p.sourceItemId}`,
  submitted: false,
  ...p,
});
const snap = (courses: RawCourse[], items: RawItem[] = [], partial: string[] = []): Snapshot => ({
  syncedAt: now.toISOString(),
  courses,
  items,
  links: [],
  partial,
});
const emptyUser = (): UserState => ({ done: {}, colors: {}, hidden: {}, shown: {}, merges: {}, syllabusHidden: {} });
const input = (p: Partial<DashboardInput>): DashboardInput => ({
  snapshots: {},
  manualItems: [],
  manualLinks: [],
  userState: emptyUser(),
  ...p,
});

describe('buildDashboard — courses', () => {
  it('matches gradescope course to brightspace by code', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000 - LEC', 'CS 18000')]),
          gradescope: snap([gsCourse('9', 'CS 180', 'CS 18000')]),
        },
      }),
      now,
    );
    expect(d.courses).toHaveLength(1);
    expect(d.courses[0]).toMatchObject({
      id: 'brightspace:42',
      code: 'CS 18000',
      name: 'CS 18000 - LEC',
      sources: { brightspace: '42', gradescope: '9' },
    });
  });

  it('unmatched gradescope course gets own card', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')]),
          gradescope: snap([gsCourse('9', 'Physics Lab', null)]),
        },
      }),
      now,
    );
    expect(d.courses.map((c) => c.id).sort()).toEqual(['brightspace:42', 'gradescope:9']);
  });

  it('merges rule forces match', () => {
    const userState = { ...emptyUser(), merges: { 'gradescope:9': 'brightspace:42' } };
    const d = buildDashboard(
      input({
        userState,
        snapshots: {
          brightspace: snap([bsCourse('42', 'PHYS 17200', 'PHYS 17200')]),
          gradescope: snap([gsCourse('9', 'Physics Lab', null)], [item({ source: 'gradescope', sourceItemId: '1', sourceCourseId: '9', title: 'Lab 1' })]),
        },
      }),
      now,
    );
    expect(d.courses).toHaveLength(1);
    expect(d.items[0]!.courseId).toBe('brightspace:42');
  });

  it('hidden course excluded with its items', () => {
    const userState = { ...emptyUser(), hidden: { 'brightspace:42': true as const } };
    const d = buildDashboard(
      input({
        userState,
        snapshots: {
          brightspace: snap(
            [bsCourse('42', 'CS 18000', 'CS 18000'), bsCourse('43', 'MA 26100', 'MA 26100')],
            [item({ source: 'brightspace', sourceItemId: '1', sourceCourseId: '42', title: 'P1' })],
          ),
        },
      }),
      now,
    );
    expect(d.courses.map((c) => c.id)).toEqual(['brightspace:43']);
    expect(d.items).toEqual([]);
  });

  it('course.partial true when its sourceCourseId is in snapshot.partial', () => {
    const d = buildDashboard(
      input({ snapshots: { brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000'), bsCourse('43', 'MA 26100', 'MA 26100')], [], ['42']) } }),
      now,
    );
    expect(d.courses.find((c) => c.id === 'brightspace:42')!.partial).toBe(true);
    expect(d.courses.find((c) => c.id === 'brightspace:43')!.partial).toBe(false);
  });

  it('colors assigned from palette in stable code order unless userState.colors overrides', () => {
    const userState = { ...emptyUser(), colors: { 'brightspace:2': '#000000' } };
    const d = buildDashboard(
      input({
        userState,
        snapshots: {
          brightspace: snap([bsCourse('1', 'MA 26100', 'MA 26100'), bsCourse('2', 'CS 18000', 'CS 18000'), bsCourse('3', 'ENGL 10600', 'ENGL 10600')]),
        },
      }),
      now,
    );
    const color = (id: string) => d.courses.find((c) => c.id === id)!.color;
    expect(color('brightspace:2')).toBe('#000000'); // CS (palette[0]) overridden
    expect(color('brightspace:3')).toBe(PALETTE[1]); // ENGL
    expect(color('brightspace:1')).toBe(PALETTE[2]); // MA
  });

  it('sorts courses by nearest incomplete due, empty courses last, tie by code', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap(
            [bsCourse('1', 'MA 26100', 'MA 26100'), bsCourse('2', 'CS 18000', 'CS 18000'), bsCourse('3', 'ENGL 10600', 'ENGL 10600'), bsCourse('4', 'CHM 11500', 'CHM 11500')],
            [
              item({ source: 'brightspace', sourceItemId: 'a', sourceCourseId: '1', title: 'Quiz', dueAt: iso('2026-11-05T09:00:00-05:00') }),
              item({ source: 'brightspace', sourceItemId: 'b', sourceCourseId: '2', title: 'Proj', dueAt: iso('2026-11-08T09:00:00-05:00') }),
              item({ source: 'brightspace', sourceItemId: 'c', sourceCourseId: '2', title: 'Lab', dueAt: iso('2026-11-04T13:00:00-05:00'), submitted: true }),
            ],
          ),
        },
      }),
      now,
    );
    expect(d.courses.map((c) => c.code)).toEqual(['MA 26100', 'CS 18000', 'CHM 11500', 'ENGL 10600']);
  });
});

describe('buildDashboard — items', () => {
  const twoSides = (gsDue: string, bsTitle = 'Project 3', bsType: RawItem['type'] = 'assignment') =>
    input({
      snapshots: {
        brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')], [
          item({ source: 'brightspace', sourceItemId: '7', sourceCourseId: '42', title: bsTitle, type: bsType, dueAt: iso('2026-11-06T23:59:00-05:00') }),
        ]),
        gradescope: snap([gsCourse('9', 'CS 180', 'CS 18000')], [
          item({ source: 'gradescope', sourceItemId: '3', sourceCourseId: '9', title: 'Project 3', dueAt: iso(gsDue), url: 'https://www.gradescope.com/courses/9/assignments/3' }),
        ]),
      },
    });

  it('dedupes same title within 1 hour', () => {
    const d = buildDashboard(twoSides('2026-11-07T00:29:00-05:00'), now);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]!.sources.sort()).toEqual(['brightspace', 'gradescope']);
    expect(d.items[0]!.sourceKeys.sort()).toEqual(['brightspace:7', 'gradescope:3']);
    expect(d.items[0]!.url).toBe('https://www.gradescope.com/courses/9/assignments/3');
  });

  it('keeps both when due times differ by 2 hours', () => {
    expect(buildDashboard(twoSides('2026-11-07T01:59:00-05:00'), now).items).toHaveLength(2);
  });

  it('dedupes calendar "- Due" event against dropbox folder', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')], [
            item({ source: 'brightspace', sourceItemId: 'event:5', sourceCourseId: '42', title: 'Project 3 - Due', type: 'event' }),
            item({ source: 'brightspace', sourceItemId: 'dropbox:7', sourceCourseId: '42', title: 'Project 3', type: 'assignment' }),
          ]),
        },
      }),
      now,
    );
    expect(d.items).toHaveLength(1);
    expect(d.items[0]!.type).toBe('assignment');
    expect(d.items[0]!.title).toBe('Project 3');
  });

  it('does not merge short titles by containment', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')], [
            item({ source: 'brightspace', sourceItemId: '1', sourceCourseId: '42', title: 'HW' }),
            item({ source: 'brightspace', sourceItemId: '2', sourceCourseId: '42', title: 'HW 10 Writeup' }),
          ]),
        },
      }),
      now,
    );
    expect(d.items).toHaveLength(2);
  });

  it('submitted if any source submitted', () => {
    const i = twoSides('2026-11-06T23:59:00-05:00');
    i.snapshots.gradescope!.items[0]!.submitted = true;
    expect(buildDashboard(i, now).items[0]!.submitted).toBe(true);
  });

  it('done flag survives resync and merge', () => {
    const i = twoSides('2026-11-06T23:59:00-05:00');
    i.userState.done = { 'brightspace:7': true };
    const it0 = buildDashboard(i, now).items[0]!;
    expect(it0.doneByUser).toBe(true);
    expect(it0.id).toBe('brightspace:7');
  });

  it('window keeps items due after now-7d and items without due', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')], [
            item({ source: 'brightspace', sourceItemId: 'old', sourceCourseId: '42', title: 'Old', dueAt: iso('2026-10-27T12:00:00-05:00') }),
            item({ source: 'brightspace', sourceItemId: 'late', sourceCourseId: '42', title: 'Late', dueAt: iso('2026-10-30T12:00:00-05:00') }),
            item({ source: 'brightspace', sourceItemId: 'none', sourceCourseId: '42', title: 'Reading', dueAt: null }),
          ]),
        },
      }),
      now,
    );
    expect(d.items.map((x) => x.title)).toEqual(['Late', 'Reading']);
  });

  it('sorts items by due asc, null last', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')], [
            item({ source: 'brightspace', sourceItemId: '1', sourceCourseId: '42', title: 'C', dueAt: null }),
            item({ source: 'brightspace', sourceItemId: '2', sourceCourseId: '42', title: 'B', dueAt: iso('2026-11-09T12:00:00-05:00') }),
            item({ source: 'brightspace', sourceItemId: '3', sourceCourseId: '42', title: 'A', dueAt: iso('2026-11-05T12:00:00-05:00') }),
          ]),
        },
      }),
      now,
    );
    expect(d.items.map((x) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('manual items and links attach to course', () => {
    const d = buildDashboard(
      input({
        snapshots: { brightspace: snap([bsCourse('42', 'MA 26100', 'MA 26100')]) },
        manualItems: [{ id: 'manual:u1', courseId: 'brightspace:42', title: 'WebAssign 14.3', dueAt: iso('2026-11-05T23:59:00-05:00'), url: 'https://www.webassign.net/' }],
        manualLinks: [{ courseId: 'brightspace:42', label: 'WebAssign', url: 'https://www.webassign.net/', category: 'homework', source: 'manual' }],
        userState: { ...emptyUser(), done: { 'manual:u1': true } },
      }),
      now,
    );
    expect(d.items[0]).toMatchObject({ id: 'manual:u1', courseId: 'brightspace:42', type: 'manual', sources: ['manual'], sourceKeys: ['manual:u1'], doneByUser: true });
    expect(d.links.some((l) => l.label === 'WebAssign' && l.courseId === 'brightspace:42')).toBe(true);
  });

  it('drops items whose course is unknown', () => {
    const d = buildDashboard(
      input({ snapshots: { brightspace: snap([], [item({ source: 'brightspace', sourceItemId: '1', sourceCourseId: '99', title: 'X' })]) } }),
      now,
    );
    expect(d.items).toEqual([]);
  });

  it('nextDue is earliest not-done not-submitted future item', () => {
    const d = buildDashboard(
      input({
        userState: { ...emptyUser(), done: { 'brightspace:2': true } },
        snapshots: {
          brightspace: snap([bsCourse('42', 'CS 18000', 'CS 18000')], [
            item({ source: 'brightspace', sourceItemId: '1', sourceCourseId: '42', title: 'Past', dueAt: iso('2026-11-03T12:00:00-05:00') }),
            item({ source: 'brightspace', sourceItemId: '2', sourceCourseId: '42', title: 'Done', dueAt: iso('2026-11-04T13:00:00-05:00') }),
            item({ source: 'brightspace', sourceItemId: '3', sourceCourseId: '42', title: 'Sub', dueAt: iso('2026-11-04T14:00:00-05:00'), submitted: true }),
            item({ source: 'brightspace', sourceItemId: '4', sourceCourseId: '42', title: 'Next', dueAt: iso('2026-11-04T23:59:00-05:00') }),
          ]),
        },
      }),
      now,
    );
    expect(d.nextDue?.title).toBe('Next');
  });

  it('nextDue null when nothing pending', () => {
    expect(buildDashboard(input({}), now).nextDue).toBeNull();
  });
});

describe('buildDashboard — links', () => {
  const withLinks = () =>
    input({
      snapshots: {
        brightspace: {
          ...snap([bsCourse('42', 'PHYS 17200', 'PHYS 17200')]),
          links: [
            { source: 'brightspace', sourceCourseId: '42', title: 'Mastering Ch1', url: 'https://purdue.brightspace.com/d2l/le/lti/1/toolLaunch/1' },
            { source: 'brightspace', sourceCourseId: '42', title: 'Mastering Ch2', url: 'https://purdue.brightspace.com/d2l/le/lti/1/toolLaunch/2' },
            { source: 'brightspace', sourceCourseId: '42', title: 'Week 1', url: 'https://purdue.brightspace.com/d2l/le/content/42/viewContent/9' },
            { source: 'brightspace', sourceCourseId: '42', title: 'Course site', url: 'https://www.physics.purdue.edu/phys172' },
            { source: 'brightspace', sourceCourseId: '42', title: 'Course site again', url: 'https://www.physics.purdue.edu/phys172' },
          ],
        },
        gradescope: snap([gsCourse('9', 'PHYS 172', 'PHYS 17200')]),
      },
      manualLinks: [{ courseId: 'brightspace:42', label: 'Piazza', url: 'https://piazza.com/class/x', category: 'discussion', source: 'manual' }],
    });

  it('every course starts with its Brightspace and Gradescope links, then classified, then manual', () => {
    const labels = buildDashboard(withLinks(), now).links.map((l) => l.label);
    expect(labels).toEqual(['Brightspace', 'Gradescope', 'Pearson', 'Course site', 'Piazza']);
  });

  it('platform links keep one per label; website links dedupe by url', () => {
    const links = buildDashboard(withLinks(), now).links;
    expect(links.filter((l) => l.label === 'Pearson')).toHaveLength(1);
    expect(links.filter((l) => l.category === 'website')).toHaveLength(1);
  });

  it('course links point at each platform course page', () => {
    const links = buildDashboard(withLinks(), now).links;
    expect(links[0]).toMatchObject({ courseId: 'brightspace:42', url: 'https://purdue.brightspace.com/d2l/home/42', category: 'lms', source: 'brightspace' });
    expect(links[1]).toMatchObject({ url: 'https://www.gradescope.com/courses/9', category: 'homework' });
  });
});

describe('dueCounts', () => {
  const mk = (id: string, due: string | null, extra: Partial<import('../../src/core/types').Item> = {}) => ({
    id, courseId: 'c', title: id, type: 'assignment' as const, dueAt: due ? iso(due) : null, url: '', sources: ['brightspace' as const],
    sourceKeys: [id], submitted: false, doneByUser: false, ...extra,
  });
  it('counts pending items due within 48h and within 7 days; ignores overdue, done, submitted, undated', () => {
    const items = [
      mk('a', '2026-11-04T20:00:00-05:00'),
      mk('b', '2026-11-06T11:00:00-05:00'),
      mk('c', '2026-11-08T12:00:00-05:00'),
      mk('d', '2026-11-12T12:00:00-05:00'),
      mk('e', '2026-11-03T12:00:00-05:00'),
      mk('f', '2026-11-05T12:00:00-05:00', { doneByUser: true }),
      mk('g', '2026-11-05T12:00:00-05:00', { submitted: true }),
      mk('h', null),
    ];
    expect(dueCounts(items, now)).toEqual({ within48: 2, week: 3 });
  });
});

describe('final review regressions', () => {
  it('never merges two items from the same platform (C1)', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          gradescope: snap([gsCourse('9', 'CS 180', 'CS 18000')], [
            item({ source: 'gradescope', sourceItemId: 'a', sourceCourseId: '9', title: 'Homework 3', submitted: true }),
            item({ source: 'gradescope', sourceItemId: 'b', sourceCourseId: '9', title: 'Homework 3 - Programming' }),
          ]),
        },
      }),
      now,
    );
    expect(d.items).toHaveLength(2);
    expect(d.items.find((i) => i.title === 'Homework 3 - Programming')!.submitted).toBe(false);
  });

  it('manual items, manual links, colors and hidden follow a course after it merges (I4)', () => {
    const userState = { ...emptyUser(), colors: { 'gradescope:9': '#000000' } };
    const d = buildDashboard(
      input({
        userState,
        snapshots: {
          brightspace: snap([bsCourse('42', 'MA 26100', 'MA 26100')]),
          gradescope: snap([gsCourse('9', 'MA 261', 'MA 26100')]),
        },
        manualItems: [{ id: 'manual:1', courseId: 'gradescope:9', title: 'WebAssign 1', dueAt: iso('2026-11-06T23:59:00-05:00'), url: 'https://www.webassign.net/' }],
        manualLinks: [{ courseId: 'gradescope:9', label: 'WebAssign', url: 'https://www.webassign.net/', category: 'homework', source: 'manual' }],
      }),
      now,
    );
    expect(d.courses).toHaveLength(1);
    expect(d.courses[0]!.color).toBe('#000000');
    expect(d.items[0]).toMatchObject({ id: 'manual:1', courseId: 'brightspace:42' });
    expect(d.links.some((l) => l.label === 'WebAssign' && l.courseId === 'brightspace:42')).toBe(true);

    const hidden = buildDashboard(
      input({
        userState: { ...emptyUser(), hidden: { 'gradescope:9': true } },
        snapshots: { brightspace: snap([bsCourse('42', 'MA 26100', 'MA 26100')]), gradescope: snap([gsCourse('9', 'MA 261', 'MA 26100')]) },
      }),
      now,
    );
    expect(hidden.courses).toEqual([]);
  });
});

describe('non-course entries', () => {
  const orgs = () =>
    input({
      snapshots: {
        brightspace: snap([
          bsCourse('42', 'Fall 2026 CHM 11510 - Merge', 'CHM 11510'),
          bsCourse('50', '2026 Orientation Programs / Purdue 101 College of Science', null),
          bsCourse('51', 'Fall 2026 ISS Training WL', null),
        ], [item({ source: 'brightspace', sourceItemId: 'q', sourceCourseId: '51', title: 'Certification Quiz', dueAt: null })]),
      },
    });

  it('entries without a course code are hidden by default, with their items', () => {
    const d = buildDashboard(orgs(), now);
    expect(d.courses.map((c) => c.id)).toEqual(['brightspace:42']);
    expect(d.items).toEqual([]);
  });

  it('userState.shown brings one back; isCourse tells them apart', () => {
    const i = orgs();
    i.userState.shown = { 'brightspace:51': true };
    const d = buildDashboard(i, now);
    expect(d.courses.map((c) => c.id).sort()).toEqual(['brightspace:42', 'brightspace:51']);
    expect(d.courses.find((c) => c.id === 'brightspace:51')!.isCourse).toBe(false);
    expect(d.courses.find((c) => c.id === 'brightspace:42')!.isCourse).toBe(true);
  });
});

describe('same-code Brightspace offerings (lecture + recitation)', () => {
  it('fold into one card, preferring the LEC offering; their items and links come along', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: {
            ...snap(
              [bsCourse('98', 'Fall 2026 MA 261 331 332 333 REC - Merge', 'MA 26100'), bsCourse('14', 'Fall 2026 MA 26100-300 LEC', 'MA 26100')],
              [item({ source: 'brightspace', sourceItemId: 'q', sourceCourseId: '98', title: 'Quiz 7' })],
            ),
            links: [{ source: 'brightspace', sourceCourseId: '98', title: 'Access Pearson', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=98&type=lti&rcode=X' }],
          },
        },
      }),
      now,
    );
    expect(d.courses.map((c) => c.id)).toEqual(['brightspace:14']);
    expect(d.items[0]!.courseId).toBe('brightspace:14');
    expect(d.links.filter((l) => l.courseId === 'brightspace:14').map((l) => l.label)).toEqual(['Brightspace', 'Pearson']);
  });
});

describe('undated content item vs dated calendar event', () => {
  it('merge when titles match exactly, keeping the date', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: snap([bsCourse('42', 'CHM 11510', 'CHM 11510')], [
            item({ source: 'brightspace', sourceItemId: 'topic:5', sourceCourseId: '42', title: 'HW11 (10.3, 12.1)_due_Nov 11', dueAt: null, url: 'https://b/topic' }),
            item({ source: 'brightspace', sourceItemId: 'event:9', sourceCourseId: '42', title: 'HW11 (10.3, 12.1)_due_Nov 11', type: 'event', dueAt: iso('2026-11-11T23:59:00-05:00'), url: 'https://b/event' }),
          ]),
        },
      }),
      now,
    );
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ dueAt: iso('2026-11-11T23:59:00-05:00'), type: 'assignment', url: 'https://b/topic' });
  });
});

describe('Pearson', () => {
  const pearsonSnap = snap([{ source: 'pearson', sourceCourseId: '14285764', name: 'Pearson MyLab', code: null, url: 'https://mylab.pearson.com/Student/DoAssignments.aspx?view=all' }], [
    item({ source: 'pearson', sourceItemId: '729259669', sourceCourseId: '14285764', title: "Lesson 29- Section 17.4 - Green's Theorem", url: 'https://mylab.pearson.com/Student/DoAssignments.aspx?view=all' }),
  ]);
  const launch = '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=98&type=lti&rcode=X-126';

  it('attaches to the course that has the Pearson link and opens through that launch link', () => {
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: { ...snap([bsCourse('14', 'Fall 2026 MA 26100-300 LEC', 'MA 26100'), bsCourse('98', 'Fall 2026 MA 261 331 332 333 REC', 'MA 26100')]), links: [{ source: 'brightspace', sourceCourseId: '98', title: 'Access Pearson', url: launch }] },
          pearson: pearsonSnap,
        },
      }),
      now,
    );
    expect(d.courses.map((c) => c.id)).toEqual(['brightspace:14']);
    expect(d.items[0]).toMatchObject({ courseId: 'brightspace:14', sources: ['pearson'], url: `https://purdue.brightspace.com${launch}` });
    expect(d.courses[0]!.sources.pearson).toBe('14285764');
  });

  it('gets its own card when no course links to Pearson', () => {
    const d = buildDashboard(input({ snapshots: { pearson: pearsonSnap } }), now);
    expect(d.courses).toEqual([expect.objectContaining({ id: 'pearson:14285764', code: 'Pearson MyLab', isCourse: true })]);
    expect(d.items[0]!.courseId).toBe('pearson:14285764');
  });
});

describe('dates captured on platform pages', () => {
  it('fill in an undated item with the same title; dated items keep their own date', () => {
    const i = input({
      snapshots: {
        brightspace: snap([bsCourse('20', 'Fall 2026 PHYS 17200-H01 LEC', 'PHYS 17200')], [
          item({ source: 'brightspace', sourceItemId: 'topic:501', sourceCourseId: '20', title: 'PHYS 172H - HW11 - FA26', dueAt: null }),
          item({ source: 'brightspace', sourceItemId: 'topic:502', sourceCourseId: '20', title: 'PHYS 172H - HW10 - FA26', dueAt: iso('2026-11-03T23:59:00-05:00') }),
        ]),
      },
    });
    i.captured = {
      'title:phys172hhw11fa26': { title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: 'x' },
      'title:phys172hhw10fa26': { title: 'PHYS 172H - HW10 - FA26', dueAt: '2026-12-01T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: 'x' },
    };
    const d = buildDashboard(i, now);
    expect(d.items.find((x) => x.title === 'PHYS 172H - HW11 - FA26')!.dueAt).toBe('2026-11-10T04:59:00.000Z');
    expect(d.items.find((x) => x.title === 'PHYS 172H - HW10 - FA26')!.dueAt).toBe(iso('2026-11-03T23:59:00-05:00'));
  });
});

describe('dates read on platform visits', () => {
  const twoCourses = () =>
    input({
      snapshots: {
        brightspace: snap([bsCourse('1', 'MA 16100', 'MA 16100'), bsCourse('2', 'CHM 11500', 'CHM 11500')], [
          item({ source: 'brightspace', sourceItemId: 'topic:1', sourceCourseId: '1', title: 'HW 1', dueAt: null }),
          item({ source: 'brightspace', sourceItemId: 'topic:2', sourceCourseId: '2', title: 'HW 1', dueAt: null }),
          item({ source: 'brightspace', sourceItemId: 'topic:3', sourceCourseId: '2', title: 'HW 2', dueAt: iso('2026-11-05T23:59:00-05:00') }),
        ]),
      },
    });

  it('visited dates are matched by item key, not title', () => {
    const i = twoCourses();
    i.captured = {
      'brightspace:topic:1': { itemKey: 'brightspace:topic:1', title: 'Homework 1', dueAt: '2026-11-10T04:59:00.000Z', platform: 'aleks', via: 'visit', evidence: 'Due: 11/9/2026 11:59 PM', checkedAt: 'x' },
    };
    const d = buildDashboard(i, now);
    const a = d.items.find((x) => x.sourceKeys.includes('brightspace:topic:1'))!;
    const b = d.items.find((x) => x.sourceKeys.includes('brightspace:topic:2'))!;
    expect(a).toMatchObject({ dueAt: '2026-11-10T04:59:00.000Z', dueFrom: 'platform', duePlatform: 'ALEKS', dueEvidence: "Read from ALEKS: 'Due: 11/9/2026 11:59 PM'" });
    expect(b.dueAt).toBeNull();
    expect(b.dueFrom).toBeUndefined();
  });

  it('a Brightspace date wins over a visited one', () => {
    const i = twoCourses();
    i.captured = { 'brightspace:topic:3': { itemKey: 'brightspace:topic:3', title: 'HW 2', dueAt: '2026-12-01T04:59:00.000Z', platform: 'aleks', via: 'visit', checkedAt: 'x' } };
    const d = buildDashboard(i, now);
    const it2 = d.items.find((x) => x.sourceKeys.includes('brightspace:topic:3'))!;
    expect(it2.dueAt).toBe(iso('2026-11-05T23:59:00-05:00'));
    expect(it2.dueFrom).toBeUndefined();
  });

  it('a visit that found no date leaves the item undated', () => {
    const i = twoCourses();
    i.captured = { 'brightspace:topic:1': { itemKey: 'brightspace:topic:1', title: 'HW 1', dueAt: null, platform: 'aleks', via: 'visit', checkedAt: 'x', misses: 1 } };
    expect(buildDashboard(i, now).items.find((x) => x.sourceKeys.includes('brightspace:topic:1'))!.dueAt).toBeNull();
  });

  it('names an unknown platform by its host', () => {
    const i = twoCourses();
    i.captured = { 'brightspace:topic:1': { itemKey: 'brightspace:topic:1', title: 'HW 1', dueAt: '2026-11-10T04:59:00.000Z', platform: 'learn.example.com', via: 'visit', evidence: 'Due Nov 9', checkedAt: 'x' } };
    expect(buildDashboard(i, now).items.find((x) => x.sourceKeys.includes('brightspace:topic:1'))!.dueEvidence).toBe("Read from learn.example.com: 'Due Nov 9'");
  });
});

describe('course shortcut prefers the Brightspace launch', () => {
  it('a Gradescope launch in the course content replaces the direct gradescope.com link', () => {
    const launch = '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=42&type=lti&rcode=G';
    const d = buildDashboard(
      input({
        snapshots: {
          brightspace: { ...snap([bsCourse('42', 'TDM 10100', 'TDM 10100')]), links: [{ source: 'brightspace', sourceCourseId: '42', title: 'Gradescope', url: launch }] },
          gradescope: snap([gsCourse('9', 'TDM 101', 'TDM 10100')]),
        },
      }),
      now,
    );
    const gs = d.links.filter((l) => l.label === 'Gradescope');
    expect(gs).toHaveLength(1);
    expect(gs[0]!.url).toBe(`https://purdue.brightspace.com${launch}`);
  });
});
