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
    settings: { visits: 'auto', syllabus: true },
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
    resync: vi.fn(async (src: string) => ({ [src]: 'ok' as const })),
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
    // The visit pass applies its own outcomes; fullSync saves nothing for them.
    expect(saved).toHaveLength(0);
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
    expect(d.resync).toHaveBeenCalledWith('pearson');
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
    const b = syncAndVisit(d, 'auto');
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

describe('startSync', () => {
  it('answers with the sync report before the platform visits finish', async () => {
    const { startSync } = await import('../../src/background/syncFlow');
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const visit = vi.fn(async () => {
      await gate;
      return [] as VisitOutcome[];
    });
    const { d } = deps(withHomework(), [], { visit });
    const run = startSync(d, 'manual');
    await expect(run.report).resolves.toEqual({ brightspace: 'ok', gradescope: 'ok' });
    expect(visit).toHaveBeenCalledTimes(1);
    release();
    await run.done;
  });

  it('a visit run that crashes does not break the sync', async () => {
    const { d } = deps(withHomework(), [], { visit: vi.fn(async () => Promise.reject(new Error('openWindow failed'))) });
    await expect(syncAndVisit(d, 'auto')).resolves.toEqual({ brightspace: 'ok', gradescope: 'ok' });
  });

  it('a Refresh that joins an automatic run gets its own manual pass afterwards', async () => {
    const { startSync } = await import('../../src/background/syncFlow');
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const visit = vi.fn(async () => {
      await gate;
      return [] as VisitOutcome[];
    });
    const { d } = deps(withHomework(), [], { visit });
    const auto = startSync(d, 'auto');
    await auto.report;
    startSync(d, 'manual');
    release();
    await auto.done;
    await new Promise((r) => setTimeout(r, 20));
    expect(d.sync).toHaveBeenCalledTimes(2);
  });
});

describe('Pearson session retries', () => {
  it('counts a failure when Pearson is still signed out after the session visit', async () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    const { d, saved } = deps(store, [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }], { resync: vi.fn(async () => ({ pearson: 'not_logged_in' as const })) });
    await syncAndVisit(d, 'auto');
    const last = saved.at(-1) as Pick<StoreShape, 'visitState'>;
    expect(last.visitState.sessions?.pearson).toEqual({ at: now.toISOString(), failures: 1 });
  });
});

describe('Gradescope sign-in through Brightspace', () => {
  it('re-reads Gradescope after a course\'s Gradescope entry signed the student back in', async () => {
    const store = withHomework({ syncMeta: { gradescope: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Gradescope', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=G` }];
    const { d } = deps(store, [{ key: 'gradescope:session', status: 'landed', host: 'www.gradescope.com' }], {
      sync: vi.fn(async () => ({ brightspace: 'ok' as const, gradescope: 'not_logged_in' as const })),
      resync: vi.fn(async () => ({ gradescope: 'ok' as const })),
    });
    const report = await syncAndVisit(d, 'auto');
    expect(d.resync).toHaveBeenCalledWith('gradescope');
    expect(report.gradescope).toBe('ok');
  });
});

describe('reading Gradescope and Pearson again after a visit signed in to them', () => {
  it('a homework visit that ended up on Gradescope (which signs the student in) is followed by a re-read of Gradescope', async () => {
    const store = withHomework({ syncMeta: { gradescope: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    const resync = vi.fn(async () => ({ gradescope: 'ok' as const }));
    const { d } = deps(store, [{ key: 'brightspace:topic:1', status: 'none', host: 'www.gradescope.com' }], {
      sync: vi.fn(async () => ({ brightspace: 'ok' as const, gradescope: 'not_logged_in' as const })),
      resync,
    });
    const report = await syncAndVisit(d, 'manual');
    expect(resync).toHaveBeenCalledWith('gradescope');
    expect(report.gradescope).toBe('ok');
  });

  it('not when Gradescope already read fine', async () => {
    const resync = vi.fn(async () => ({ gradescope: 'ok' as const }));
    const { d } = deps(withHomework(), [{ key: 'brightspace:topic:1', status: 'none', host: 'www.gradescope.com' }], { resync });
    await syncAndVisit(d, 'manual');
    expect(resync).not.toHaveBeenCalled();
  });

  it('a sign-in visit that could not see where it ended up is still followed by a re-read', async () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    const resync = vi.fn(async () => ({ pearson: 'ok' as const }));
    const { d } = deps(store, [{ key: 'pearson:session', status: 'failed', reason: 'timeout' }], {
      sync: vi.fn(async () => ({ brightspace: 'ok' as const, pearson: 'not_logged_in' as const })),
      resync,
    });
    const report = await syncAndVisit(d, 'manual');
    expect(resync).toHaveBeenCalledWith('pearson');
    expect(report.pearson).toBe('ok');
  });
});

describe('frame memory of a session', () => {
  const pearsonStore = () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    return store;
  };
  it('a frame-landed session visit followed by a resync that is still signed out marks the session frame: failed', async () => {
    const { d, saved } = deps(pearsonStore(), [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com', via: 'frame' }], { resync: vi.fn(async () => ({ pearson: 'not_logged_in' as const })) });
    await syncAndVisit(d, 'auto');
    const last = saved.at(-1) as Pick<StoreShape, 'visitState'>;
    expect(last.visitState.sessions?.pearson).toEqual({ at: now.toISOString(), failures: 1, frame: 'failed' });
  });
  it('a marked session that went to the window and is still signed out keeps the mark; a later success clears it', async () => {
    const store = pearsonStore();
    store.visitState.sessions = { pearson: { at: '2026-11-01T00:00:00Z', failures: 1, frame: 'failed' } };
    const still = deps(store, [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }], { resync: vi.fn(async () => ({ pearson: 'not_logged_in' as const })) });
    await syncAndVisit(still.d, 'auto');
    expect((still.saved.at(-1) as Pick<StoreShape, 'visitState'>).visitState.sessions?.pearson).toEqual({ at: '2026-11-01T00:00:00Z', failures: 2, frame: 'failed' });
    const ok = deps(store, [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }]);
    await syncAndVisit(ok.d, 'auto');
    expect((ok.saved.at(-1) as Pick<StoreShape, 'visitState'>).visitState.sessions?.pearson).toEqual({ at: '2026-11-01T00:00:00Z', failures: 0 });
  });
  it('a resync that works clears the mark', async () => {
    const store = pearsonStore();
    store.visitState.sessions = { pearson: { at: '2026-11-01T00:00:00Z', failures: 1, frame: 'failed' } };
    const { d, saved } = deps(store, [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }]);
    await syncAndVisit(d, 'auto');
    const last = saved.at(-1) as Pick<StoreShape, 'visitState'>;
    expect(last.visitState.sessions?.pearson).toEqual({ at: '2026-11-01T00:00:00Z', failures: 0 });
  });
});

describe('syncAndVisit status line', () => {
  it('says what the run is doing from start to end: sources, then syllabi, then (visits report their own), then nothing', async () => {
    const steps: unknown[] = [];
    const { d } = deps(withHomework(), [], {
      status: vi.fn(async (p) => void steps.push(p)),
      sync: vi.fn(async () => {
        steps.push('sync');
        return { brightspace: 'ok' as const };
      }),
      syllabus: vi.fn(async () => {
        steps.push('syllabus');
        return { syllabus: {}, syllabusNav: {} };
      }),
      visit: vi.fn(async () => {
        steps.push('visit');
        return [];
      }),
    });
    await syncAndVisit(d, 'auto');
    expect(steps).toEqual([{ done: 0, total: 0, phase: 'sources' }, 'sync', { done: 0, total: 0, phase: 'syllabus' }, 'syllabus', 'visit', null]);
  });

  it('clears the line when the run fails or Brightspace is signed out', async () => {
    const steps: unknown[] = [];
    const { d } = deps(withHomework(), [], { status: vi.fn(async (p) => void steps.push(p)), sync: vi.fn(async () => ({ brightspace: 'not_logged_in' as const })) });
    await syncAndVisit(d, 'auto');
    expect(steps.at(-1)).toBeNull();
    const steps2: unknown[] = [];
    const { d: d2 } = deps(withHomework(), [], { status: vi.fn(async (p) => void steps2.push(p)), sync: vi.fn(async () => Promise.reject(new Error('offline'))) });
    await syncAndVisit(d2, 'auto').catch(() => undefined);
    expect(steps2.at(-1)).toBeNull();
  });
});

describe('first sync uses the authenticated hidden Pearson page', () => {
  it('passes the rendered assignment list to resync without another button press', async () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    const sessionHtml = '<table class="assignement-list-table"><tr><th scope="row">HW 1</th></tr></table>';
    const { d } = deps(store, [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com', via: 'frame', sessionHtml }], { sync: vi.fn(async () => ({ brightspace: 'ok' as const, pearson: 'not_logged_in' as const })) });
    expect((await syncAndVisit(d, 'auto')).pearson).toBe('ok');
    expect(d.resync).toHaveBeenCalledWith('pearson', sessionHtml);
  });
  it('rechecks the connector even when its frame could not confirm the landing', async () => {
    const { d } = deps(withHomework(), [{ key: 'pearson:session', status: 'failed', reason: 'frame' }], { sync: vi.fn(async () => ({ brightspace: 'ok' as const, pearson: 'not_logged_in' as const })) });
    expect((await syncAndVisit(d, 'auto')).pearson).toBe('ok');
    expect(d.resync).toHaveBeenCalledWith('pearson');
  });
});

describe('Pearson failure never navigates the dashboard', () => {
  it('does not invoke an obsolete foreground recovery callback', async () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Access Pearson', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    const forbidden = vi.fn(async () => ({ pearson: 'ok' as const }));
    const { d } = deps(store, [{ key: 'pearson:session', status: 'failed', reason: 'frame' }], {
      sync: vi.fn(async () => ({ brightspace: 'ok' as const, pearson: 'not_logged_in' as const })),
      resync: vi.fn(async () => ({ pearson: 'not_logged_in' as const })),
    });
    Object.assign(d, { recoverInitialPearson: forbidden });
    expect((await syncAndVisit(d, 'auto')).pearson).toBe('not_logged_in');
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe('source recovery after the separate homework pass', () => {
  it('still rereads Gradescope reached by homework when Pearson had its own session pass', async () => {
    const store = withHomework({ syncMeta: { pearson: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } }, gradescope: { lastError: { at: now.toISOString(), reason: 'not_logged_in' } } } });
    store.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Access Pearson', url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` }];
    const { d } = deps(store, [], {
      sync: vi.fn(async () => ({ brightspace: 'ok' as const, pearson: 'not_logged_in' as const, gradescope: 'not_logged_in' as const })),
      visit: vi.fn(async (targets: VisitTarget[]) => targets[0]?.mode === 'session' ? [{ key: 'pearson:session', status: 'landed' as const, host: 'mylab.pearson.com' }] : [{ key: 'brightspace:topic:1', status: 'none' as const, host: 'www.gradescope.com' }]),
    });
    const report = await syncAndVisit(d, 'auto');
    expect(report).toEqual({ brightspace: 'ok', pearson: 'ok', gradescope: 'ok' });
    expect(d.resync).toHaveBeenCalledWith('gradescope');
  });
});
