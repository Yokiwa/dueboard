import { describe, it, expect } from 'vitest';
import { applyOutcomes, type VisitOutcome, type VisitTarget } from '../../src/visits/schedule';
import { migrate } from '../../src/storage/store';
import type { CapturedDue } from '../../src/core/types';

const now = new Date('2026-11-07T12:00:00-05:00');
const t = (n: number): VisitTarget => ({ key: `brightspace:topic:${n}`, title: `HW ${n}`, courseId: 'brightspace:1', launchUrl: `https://purdue.brightspace.com/x/${n}`, mode: 'due' });
const prev = (p: Partial<CapturedDue> = {}): CapturedDue => ({ itemKey: 'brightspace:topic:1', title: 'HW 1', dueAt: null, platform: 'aleks', via: 'visit', checkedAt: 'old', ...p });
const run = (outcomes: Parameters<typeof applyOutcomes>[2], captured: Record<string, CapturedDue> = {}) =>
  applyOutcomes(migrate({ captured }), [t(1)], outcomes, now);

describe('applyOutcomes', () => {
  it('stores a found date with its platform and evidence, resetting counters', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'found', host: 'www-awu.aleks.com', found: { title: 'Homework 1', dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due: 11/9/2026 11:59 PM' } }], {
      'brightspace:topic:1': prev({ misses: 2, failures: 1 }),
    });
    expect(r.captured['brightspace:topic:1']).toEqual({
      itemKey: 'brightspace:topic:1', title: 'Homework 1', dueAt: '2026-11-10T04:59:00.000Z', platform: 'aleks', via: 'visit',
      evidence: 'Due: 11/9/2026 11:59 PM', checkedAt: now.toISOString(), misses: 0, failures: 0,
    });
  });

  it('names an unknown platform by its host', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'found', host: 'learn.example.com', found: { title: 'A', dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due Nov 9' } }]);
    expect(r.captured['brightspace:topic:1']!.platform).toBe('learn.example.com');
  });

  it('counts a visit without a date as a miss, keeping an earlier date', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'none', host: 'www.aleks.com' }], { 'brightspace:topic:1': prev({ dueAt: '2026-11-10T04:59:00.000Z', misses: 1 }) });
    expect(r.captured['brightspace:topic:1']).toMatchObject({ dueAt: '2026-11-10T04:59:00.000Z', misses: 2, failures: 0, checkedAt: now.toISOString() });
  });

  it('counts a failed visit, keeping what was known', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'failed', reason: 'timeout' }]);
    expect(r.captured['brightspace:topic:1']).toMatchObject({ itemKey: 'brightspace:topic:1', title: 'HW 1', dueAt: null, failures: 1, checkedAt: now.toISOString() });
  });

  it('marks a host without access as blocked and asks for it once', () => {
    const r = applyOutcomes(
      migrate({ visitState: { needsPermission: ['learn.example.com'], snoozed: {} } }),
      [t(1)],
      [{ key: 'brightspace:topic:1', status: 'needs_permission', host: 'learn.example.com' }],
      now,
    );
    expect(r.captured['brightspace:topic:1']).toMatchObject({ blocked: 'learn.example.com', platform: 'learn.example.com', dueAt: null });
    expect(r.visitState.needsPermission).toEqual(['learn.example.com']);
  });

  it('counts a frame failure like any other failure', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'failed', reason: 'frame' }], { 'brightspace:topic:1': prev({ failures: 1 }) });
    expect(r.captured['brightspace:topic:1']!.failures).toBe(2);
  });

  it('a session target that landed in a frame is handled like a window landing', () => {
    const session: VisitTarget = { key: 'pearson:session', title: 'Pearson', courseId: '', launchUrl: 'x', platform: 'pearson', mode: 'session' };
    const r = applyOutcomes(migrate({}), [session], [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com', via: 'frame' }], now);
    expect(r.visitState.sessions?.pearson).toEqual({ at: now.toISOString(), failures: 0 });
  });

  it('keeps the frame mark of a session across a visit', () => {
    const session: VisitTarget = { key: 'pearson:session', title: 'Pearson', courseId: '', launchUrl: 'x', platform: 'pearson', mode: 'session' };
    const store = migrate({ visitState: { sessions: { pearson: { at: 'old', failures: 1, frame: 'failed' } } } });
    const r = applyOutcomes(store, [session], [{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }], now);
    expect(r.visitState.sessions?.pearson).toEqual({ at: now.toISOString(), failures: 1, frame: 'failed' });
  });

  it('clears the block once a visit gets through', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'none', host: 'learn.example.com' }], { 'brightspace:topic:1': prev({ blocked: 'learn.example.com' }) });
    expect(r.captured['brightspace:topic:1']!.blocked).toBeUndefined();
  });

  it('leaves captured dates alone for sign-out, session and text outcomes, and records the run', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'signed_out' }, { key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }]);
    expect(r.captured).toEqual({});
    expect(r.visitState.lastRun).toBe(now.toISOString());
  });
});

describe('applyOutcomes: syllabus visits', () => {
  const st: VisitTarget = { key: 'syllabus:1', title: 'Syllabus', courseId: 'brightspace:1', launchUrl: 'https://purdue.simplesyllabus.com/doc/1', mode: 'syllabus' };
  const base = () =>
    migrate({ snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], links: [], courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA', code: 'MA 16100', url: 'u', start: '2026-08-20T04:00:00.000Z', end: '2026-12-20T04:59:00.000Z' }] } } });

  it('stores rows read from the page', () => {
    const r = applyOutcomes(base(), [st], [{ key: 'syllabus:1', status: 'text', host: 'purdue.simplesyllabus.com', lines: ['Week 7 | Oct 14 | Exam 2'] }], now);
    expect(r.syllabus?.['1']).toMatchObject({ source: st.launchUrl, kind: 'visit', readAt: now.toISOString(), rows: [{ title: 'Exam 2' }] });
  });
  it('marks a failed or blocked syllabus visit unreadable so it waits a week', () => {
    const r = applyOutcomes(base(), [st], [{ key: 'syllabus:1', status: 'needs_permission', host: 'purdue.simplesyllabus.com' }], now);
    expect(r.syllabus?.['1']).toMatchObject({ error: 'unreadable', readAt: now.toISOString() });
    expect(r.visitState.needsPermission).toEqual(['purdue.simplesyllabus.com']);
  });
  it("keeps the course link's last-modified time, so a syllabus read once is not read again every sync", async () => {
    const { dueVisits } = await import('../../src/visits/schedule');
    const s = base();
    s.settings.syllabus = true;
    s.settings.visits = 'auto';
    s.snapshots.brightspace!.syllabusSources = [{ ou: '1', kind: 'visit', url: st.launchUrl, title: 'Syllabus Quiz', modified: '2026-08-20T15:00:00.000Z' }];
    const outcomes: VisitOutcome[] = [
      { key: 'syllabus:1', status: 'text', host: 'www.gradescope.com', lines: ['Project #9', 'Total Points'] },
      { key: 'syllabus:1', status: 'failed', reason: 'timeout' },
    ];
    for (const outcome of outcomes) {
      const r = applyOutcomes(s, [st], [outcome], now);
      expect(r.syllabus['1']!.modified).toBe('2026-08-20T15:00:00.000Z');
      const later = new Date(now.getTime() + 5 * 60_000);
      expect(dueVisits({ ...s, ...r }, later, 'auto', ['https://*/*']).map((t) => t.key)).not.toContain('syllabus:1');
    }
  });
});

describe('applyOutcomes: blocked items once allowed', () => {
  it('a failed visit after access was granted clears the block, so normal backoff applies', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'failed', reason: 'timeout' }], { 'brightspace:topic:1': prev({ blocked: 'learn.example.com' }) });
    expect(r.captured['brightspace:topic:1']!.blocked).toBeUndefined();
    expect(r.captured['brightspace:topic:1']!.failures).toBe(1);
  });
});

describe('forgetUnfoundVisits (after an update)', () => {
  it('forgets visits that found nothing, so the new version reads them again; keeps found dates and page captures', async () => {
    const { forgetUnfoundVisits } = await import('../../src/visits/apply');
    const captured: Record<string, CapturedDue> = {
      'brightspace:topic:1': prev({ misses: 3 }),
      'brightspace:topic:2': prev({ itemKey: 'brightspace:topic:2', failures: 2, platform: 'unknown' }),
      'brightspace:topic:3': prev({ itemKey: 'brightspace:topic:3', dueAt: '2026-11-10T04:59:00.000Z' }),
      'title:hw4': { title: 'HW4', dueAt: '2026-11-12T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: 'x' },
    };
    expect(Object.keys(forgetUnfoundVisits(captured)).sort()).toEqual(['brightspace:topic:3', 'title:hw4']);
  });
});

describe('forgetVisitMemory (after an update)', () => {
  it('clears what the old version learned about frames and sign-in attempts; keeps the rest', async () => {
    const { forgetVisitMemory } = await import('../../src/visits/apply');
    const before = {
      windowId: 4,
      lastRun: 'x',
      needsPermission: ['a.com'],
      snoozed: { 'a.com': 'y' },
      sessions: { pearson: { at: 'z', failures: 3, frame: 'failed' as const } },
      frame: { gradescope: { blocked: 0, skipUntil: '2026-11-19T00:00:00.000Z' } },
    };
    expect(forgetVisitMemory(before)).toEqual({ windowId: 4, lastRun: 'x', needsPermission: ['a.com'], snoozed: { 'a.com': 'y' }, sessions: {}, frame: {} });
  });
});

describe('applyOutcomes: check visits', () => {
  const ct = (n: number): VisitTarget => ({ ...t(n), mode: 'check', platform: 'aleks' });
  const score = { text: '18/25', earned: 18, possible: 25, from: 'aleks', evidence: 'Score: 18/25' };
  const apply = (outcomes: VisitOutcome[], extra: Record<string, unknown> = {}, targets = [ct(1)]) => applyOutcomes(migrate(extra), targets, outcomes, now);

  it('a checked answer folds into completion, named by the platform it was read on', () => {
    const r = apply([{ key: 'brightspace:topic:1', status: 'checked', host: 'www.aleks.com', check: { state: 'done', by: 'score', source: 'aleks', score, evidence: 'Score: 18/25' } }]);
    expect(r.completion['brightspace:topic:1']).toEqual({
      state: 'done', by: 'score', source: 'ALEKS', score: { ...score, from: 'ALEKS' }, evidence: 'Score: 18/25', checkedAt: now.toISOString(),
    });
    expect(r.captured['brightspace:topic:1']).toBeUndefined();
  });

  it('a null answer adds a try and keeps what was known', () => {
    const r = apply([{ key: 'brightspace:topic:1', status: 'checked', host: 'www.aleks.com', check: null }], {
      completion: { 'brightspace:topic:1': { state: 'unknown', checkedAt: 'old', tries: 1 } },
    });
    expect(r.completion['brightspace:topic:1']).toEqual({ state: 'unknown', checkedAt: now.toISOString(), tries: 2 });
    const first = apply([{ key: 'brightspace:topic:1', status: 'checked', host: 'www.aleks.com', check: null }]);
    expect(first.completion['brightspace:topic:1']).toMatchObject({ state: 'unknown', tries: 1 });
  });

  it('a failed check visit records nothing (the page was not read)', () => {
    const r = apply([{ key: 'brightspace:topic:1', status: 'failed', reason: 'timeout' }]);
    expect(r.completion['brightspace:topic:1']).toBeUndefined();
    expect(r.captured['brightspace:topic:1']).toBeUndefined();
  });

  it('a check visit without access asks for the site once', () => {
    const r = apply([{ key: 'brightspace:topic:1', status: 'needs_permission', host: 'learn.example.com' }]);
    expect(r.visitState.needsPermission).toEqual(['learn.example.com']);
    expect(r.completion['brightspace:topic:1']).toBeUndefined();
  });

  it('a found outcome with a check also records it', () => {
    const r = apply(
      [{ key: 'brightspace:topic:1', status: 'found', host: 'www.aleks.com', found: { title: 'HW 1', dueAt: '2026-11-05T04:59:00.000Z', evidence: 'Due Nov 4' }, check: { state: 'not_done', source: 'aleks', evidence: 'Not submitted' } }],
      {},
      [t(1)],
    );
    expect(r.captured['brightspace:topic:1']).toMatchObject({ dueAt: '2026-11-05T04:59:00.000Z' });
    expect(r.completion['brightspace:topic:1']).toEqual({ state: 'not_done', source: 'ALEKS', evidence: 'Not submitted', checkedAt: now.toISOString() });
  });

  it('a found outcome without a check leaves completion alone', () => {
    const r = apply([{ key: 'brightspace:topic:1', status: 'found', host: 'www.aleks.com', found: { title: 'HW 1', dueAt: '2026-11-05T04:59:00.000Z', evidence: 'Due Nov 4' } }], {}, [t(1)]);
    expect(r.completion).toEqual({});
  });
});
