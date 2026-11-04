import { describe, it, expect } from 'vitest';
import { buildDashboard, PALETTE, type DashboardInput } from '../../src/core/dashboard';
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
const emptyUser = (): UserState => ({ done: {}, colors: {}, hidden: {}, merges: {} });
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
