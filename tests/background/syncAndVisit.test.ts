import { describe, it, expect, vi } from 'vitest';
import { syncAndVisit, type SyncAndVisitDeps } from '../../src/background/syncFlow';
import { migrate } from '../../src/storage/store';
import type { StoreShape } from '../../src/core/types';
import type { VisitOutcome, VisitTarget } from '../../src/visits/schedule';

const now = new Date('2026-11-07T12:00:00-05:00');
const B = 'https://purdue.brightspace.com';
const withHomework = (extra: Record<string, unknown> = {}): StoreShape =>
  migrate({
    snapshots: {
      brightspace: {
        syncedAt: now.toISOString(), partial: [], links: [],
        courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA 16100', code: 'MA 16100', url: `${B}/d2l/home/1` }],
        items: [{ source: 'brightspace', sourceItemId: 'topic:1', sourceCourseId: '1', title: 'Homework 1', type: 'assignment', dueAt: null, url: `${B}/v/1`, submitted: false, launchUrl: `${B}/launch/1` }],
      },
    },
    ...extra,
  });

function deps(store: StoreShape, outcomes: VisitOutcome[] = [], over: Partial<SyncAndVisitDeps> = {}) {
  const saved: unknown[] = [];
  const d: SyncAndVisitDeps = {
    load: async () => store,
    sync: vi.fn(async () => ({ brightspace: 'ok' as const, gradescope: 'ok' as const })),
    granted: async () => ['https://*/*'],
    visit: vi.fn(async (_t: VisitTarget[]) => outcomes),
    save: vi.fn(async (p) => {
      saved.push(p);
    }),
    resyncPearson: vi.fn(async () => ({ pearson: 'ok' as const })),
    now: () => now,
    ...over,
  };
  return { d, saved };
}

describe('syncAndVisit', () => {
  it('syncs, then visits what the schedule picks, then saves the results', async () => {
    const out: VisitOutcome[] = [{ key: 'brightspace:topic:1', status: 'found', host: 'www.aleks.com', found: { title: 'Homework 1', dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due Nov 9' } }];
    const { d, saved } = deps(withHomework(), out);
    const report = await syncAndVisit(d, 'auto');
    expect(report).toEqual({ brightspace: 'ok', gradescope: 'ok' });
    expect(d.visit).toHaveBeenCalledWith([expect.objectContaining({ key: 'brightspace:topic:1', launchUrl: `${B}/launch/1` })]);
    expect(saved).toHaveLength(1);
    expect((saved[0] as Pick<StoreShape, 'captured'>).captured['brightspace:topic:1']!.dueAt).toBe('2026-11-10T04:59:00.000Z');
  });

  it('does not open the window when nothing needs a visit', async () => {
    const { d } = deps(migrate({}));
    await syncAndVisit(d, 'auto');
    expect(d.visit).not.toHaveBeenCalled();
  });

  it('skips visits when Brightspace says the student is signed out', async () => {
    const { d } = deps(withHomework(), [], { sync: vi.fn(async () => ({ brightspace: 'not_logged_in' as const })) });
    await syncAndVisit(d, 'manual');
    expect(d.visit).not.toHaveBeenCalled();
  });

  it('re-reads Pearson after a visit restored its session', async () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    const { d } = deps(store, [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }]);
    const report = await syncAndVisit(d, 'auto');
    expect(d.resyncPearson).toHaveBeenCalledTimes(1);
    expect(report.pearson).toBe('ok');
  });
});

describe('syncAndVisit: syllabus step', () => {
  it('reads syllabi after the sync and saves what changed', async () => {
    const calls: string[] = [];
    const syllabus = vi.fn(async () => {
      calls.push('syllabus');
      return { syllabus: { '1': { source: 'u', kind: 'pdf' as const, readAt: now.toISOString(), modified: null, rows: [] } }, syllabusNav: {} };
    });
    const { d, saved } = deps(migrate({}), [], { syllabus, sync: vi.fn(async () => (calls.push('sync'), { brightspace: 'ok' as const })) });
    await syncAndVisit(d, 'auto');
    expect(calls).toEqual(['sync', 'syllabus']);
    expect(saved[0]).toEqual({ syllabus: { '1': expect.objectContaining({ source: 'u' }) }, syllabusNav: {} });
  });

  it('skips the syllabus step while signed out of Brightspace', async () => {
    const syllabus = vi.fn(async () => ({ syllabus: {}, syllabusNav: {} }));
    const { d } = deps(migrate({}), [], { syllabus, sync: vi.fn(async () => ({ brightspace: 'not_logged_in' as const })) });
    await syncAndVisit(d, 'auto');
    expect(syllabus).not.toHaveBeenCalled();
  });
});

describe('syncAndVisit: one run at a time', () => {
  it('a sync requested while another runs joins it instead of opening a second visit window', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const visit = vi.fn(async () => {
      await gate;
      return [] as VisitOutcome[];
    });
    const { d } = deps(withHomework(), [], { visit });
    const a = syncAndVisit(d, 'auto');
    const b = syncAndVisit(d, 'manual');
    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all([a, b]);
    expect(d.sync).toHaveBeenCalledTimes(1);
    expect(visit).toHaveBeenCalledTimes(1);
  });

  it('a later sync after the first finished runs normally', async () => {
    const { d } = deps(withHomework());
    await syncAndVisit(d, 'auto');
    await syncAndVisit(d, 'auto');
    expect(d.sync).toHaveBeenCalledTimes(2);
  });
});
