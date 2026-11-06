import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { runSync, isStale } from '../../src/sync/runSync';
import { loadStore, saveSnapshot } from '../../src/storage/store';
import type { Connector, ConnectorResult, SourceId } from '../../src/core/types';

const okResult = (n: number): ConnectorResult => ({
  ok: true,
  courses: [{ source: 'brightspace', sourceCourseId: String(n), name: `C${n}`, code: null, url: 'u' }],
  items: [],
  links: [],
  partial: [],
});
const connector = (id: SourceId, result: ConnectorResult, delayMs = 0, counter?: { n: number }): Connector => ({
  id,
  fetchAll: async () => {
    if (counter) counter.n++;
    await new Promise((r) => setTimeout(r, delayMs));
    return result;
  },
});
const at = () => new Date('2026-11-04T17:00:00.000Z');

describe('runSync', () => {
  beforeEach(() => fakeBrowser.reset());

  it('success saves snapshot and lastSuccess for every source', async () => {
    const report = await runSync([connector('brightspace', okResult(1)), connector('gradescope', okResult(2), 5)], at);
    expect(report).toEqual({ brightspace: 'ok', gradescope: 'ok' });
    const s = await loadStore();
    expect(s.snapshots.brightspace?.courses[0]?.sourceCourseId).toBe('1');
    expect(s.snapshots.gradescope?.courses[0]?.sourceCourseId).toBe('2');
    expect(s.snapshots.brightspace?.syncedAt).toBe('2026-11-04T17:00:00.000Z');
    expect(s.syncMeta.gradescope?.lastSuccess).toBe('2026-11-04T17:00:00.000Z');
  });

  it('failure keeps previous snapshot and records lastError', async () => {
    await saveSnapshot('gradescope', { syncedAt: 'old', courses: [], items: [], links: [], partial: [] });
    const report = await runSync([connector('gradescope', { ok: false, reason: 'not_logged_in', detail: 'redirect' })], at);
    expect(report).toEqual({ gradescope: 'not_logged_in' });
    const s = await loadStore();
    expect(s.snapshots.gradescope?.syncedAt).toBe('old');
    expect(s.syncMeta.gradescope?.lastError).toMatchObject({ reason: 'not_logged_in', detail: 'redirect' });
  });

  it('a throwing connector is recorded as network failure', async () => {
    const bad: Connector = { id: 'brightspace', fetchAll: async () => { throw new Error('boom'); } };
    expect(await runSync([bad], at)).toEqual({ brightspace: 'network' });
  });

  it('connectors run in parallel', async () => {
    const t0 = Date.now();
    await runSync([connector('brightspace', okResult(1), 50), connector('gradescope', okResult(2), 50)], at);
    expect(Date.now() - t0).toBeLessThan(90);
  });

  it('concurrent calls share one run', async () => {
    const counter = { n: 0 };
    const c = [connector('brightspace', okResult(1), 20, counter)];
    const [a, b] = await Promise.all([runSync(c, at), runSync(c, at)]);
    expect(counter.n).toBe(1);
    expect(a).toEqual(b);
    await runSync(c, at);
    expect(counter.n).toBe(2);
  });
});

describe('isStale', () => {
  const now = new Date('2026-11-04T17:00:00.000Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

  it('true when a source never synced', () => {
    expect(isStale({}, now)).toBe(true);
    expect(isStale({ brightspace: { lastSuccess: ago(1) } }, now)).toBe(true);
  });
  it('true when the oldest attempt is older than 5 min', () => {
    expect(isStale({ brightspace: { lastSuccess: ago(1) }, gradescope: { lastSuccess: ago(6) } }, now)).toBe(true);
  });
  it('false when every source was attempted recently, even if it failed', () => {
    expect(
      isStale({ brightspace: { lastSuccess: ago(2) }, gradescope: { lastSuccess: ago(90), lastError: { at: ago(1), reason: 'not_logged_in' } } }, now),
    ).toBe(false);
  });
});

describe('isStale with optional sources', () => {
  const now = new Date('2026-11-04T17:00:00.000Z');
  const recent = new Date(now.getTime() - 60_000).toISOString();
  it('ignores a source that was never set up (no meta) and checks it once it has meta', () => {
    const core = { brightspace: { lastSuccess: recent }, gradescope: { lastSuccess: recent } };
    expect(isStale(core, now)).toBe(false);
    expect(isStale({ ...core, pearson: { lastError: { at: new Date(now.getTime() - 3600_000).toISOString(), reason: 'not_logged_in' } } }, now)).toBe(true);
  });
});
