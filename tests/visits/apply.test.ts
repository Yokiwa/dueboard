import { describe, it, expect } from 'vitest';
import { applyOutcomes, type VisitTarget } from '../../src/visits/schedule';
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
});

describe('applyOutcomes: blocked items once allowed', () => {
  it('a failed visit after access was granted clears the block, so normal backoff applies', () => {
    const r = run([{ key: 'brightspace:topic:1', status: 'failed', reason: 'timeout' }], { 'brightspace:topic:1': prev({ blocked: 'learn.example.com' }) });
    expect(r.captured['brightspace:topic:1']!.blocked).toBeUndefined();
    expect(r.captured['brightspace:topic:1']!.failures).toBe(1);
  });
});
