import { describe, it, expect, vi } from 'vitest';
import { frameKey, runVisitPass, type VisitPassDeps } from '../../src/background/visitPass';
import { PLATFORMS } from '../../src/core/platformRegistry';
import { migrate } from '../../src/storage/store';
import type { StoreShape } from '../../src/core/types';
import { type VisitOutcome, type VisitTarget } from '../../src/visits/schedule';
import type { FrameRunOptions, FrameVisitDone } from '../../src/visits/frameRunner';
import type { VisitLogEntry } from '../../src/visits/runner';

const now = new Date('2026-11-07T12:00:00Z');
const B = 'https://purdue.brightspace.com';
const t = (n: number | string, extra: Partial<VisitTarget> = {}): VisitTarget => ({
  key: `brightspace:topic:${n}`, title: `Homework ${n}`, courseId: '1', launchUrl: `${B}/launch/${n}`, mode: 'due', platform: 'aleks', ...extra,
});
const found = (n: number | string): VisitOutcome => ({ key: `brightspace:topic:${n}`, status: 'found', host: 'www.aleks.com', found: { title: `Homework ${n}`, dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due Nov 9' } });
const none = (n: number | string): VisitOutcome => ({ key: `brightspace:topic:${n}`, status: 'none', host: 'www.aleks.com' });
const blocked = (n: number | string): VisitOutcome => ({ key: `brightspace:topic:${n}`, status: 'failed', reason: 'frame' });
const log = (target: VisitTarget): VisitLogEntry => ({ at: now.toISOString(), key: target.key, title: target.title, opened: 'x', frames: [], result: 'none', mode: 'frame' });
const done = (target: VisitTarget, outcome: VisitOutcome, fallback = false): FrameVisitDone => ({ target, outcome, fallback, listed: [], log: log(target) });

function setup(over: { store?: StoreShape; frames?: VisitPassDeps['frames'] } = {}) {
  let store = over.store ?? migrate({});
  const saves: Partial<StoreShape>[] = [];
  const progress: [number, number][] = [];
  const logs: VisitLogEntry[] = [];
  const deps: VisitPassDeps = {
    load: async () => store,
    save: async (p) => {
      saves.push(p);
      store = { ...store, ...p };
    },
    now: () => now,
    frames: over.frames ?? (async () => []),
    signedIn: async () => true,
    progress: (d, n) => void progress.push([d, n]),
    log: (e) => void logs.push(e),
  };
  return { deps, saves, progress, logs, get store() { return store; } };
}

/** Frames that report the scripted results, in order, each through onDone. */
const scripted = (results: (t: VisitTarget[]) => FrameVisitDone[]): VisitPassDeps['frames'] => async (targets, opts: FrameRunOptions) => {
  const out = results(targets);
  for (const d of out) await opts.onDone(d);
  return out;
};

describe('frameKey', () => {
  it('prefers the target platform, then the captured platform, then the course', () => {
    const captured = { 'brightspace:topic:1': { itemKey: 'brightspace:topic:1', title: 'x', dueAt: null, platform: 'wiley', via: 'visit' as const, checkedAt: now.toISOString() } };
    expect(frameKey(t(1), captured)).toBe('aleks');
    expect(frameKey(t(1, { platform: undefined }), captured)).toBe('wiley');
    expect(frameKey(t(2, { platform: undefined }), captured)).toBe('course:1');
  });
});

describe('hidden-only visit pass', () => {
  it.each(PLATFORMS.filter((p) => p.reader !== 'none'))('never falls back for $label, even with legacy window settings and skip memory', async (platform) => {
    const target = t(1, { platform: platform.id });
    const store = migrate({ settings: { windowFallback: true }, visitState: { frame: { [platform.id]: { blocked: 0, skipUntil: '2099-01-01' } } } });
    // Also guard callers passing an unmigrated store.
    store.settings.windowFallback = true;
    const windows = vi.fn();
    const frames = vi.fn(scripted(() => [done(target, blocked(1), true)]));
    const s = setup({ store, frames });
    Object.assign(s.deps, { windows });
    expect(await runVisitPass(s.deps, [target])).toEqual([blocked(1)]);
    expect(frames.mock.calls[0]![0]).toEqual([target]);
    expect(windows).not.toHaveBeenCalled();
    expect(s.store.captured[target.key]?.failures).toBe(1);
    expect(s.progress.at(-1)).toEqual([1, 1]);
  });

  it('retries a session previously marked as frame-failed without opening a window', async () => {
    const target = t(1, { mode: 'session', platform: 'pearson' });
    const frames = vi.fn(scripted(() => [done(target, blocked(1), true)]));
    const s = setup({ store: migrate({ visitState: { sessions: { pearson: { frame: 'failed' } } } }), frames });
    await runVisitPass(s.deps, [target]);
    expect(frames.mock.calls[0]![0]).toEqual([target]);
  });

  it('serializes concurrent saves and preserves an earlier date when a frame fails', async () => {
    const targets = [t(1), t(2)];
    const s = setup({ frames: async (_ts, opts) => {
      await Promise.all(targets.map((target, i) => opts.onDone(done(target, found(i + 1)))));
      return [];
    } });
    await runVisitPass(s.deps, targets);
    expect(Object.keys(s.store.captured)).toHaveLength(2);
    s.deps.frames = scripted(() => [done(targets[0]!, blocked(1), true)]);
    await runVisitPass(s.deps, [targets[0]!]);
    expect(s.store.captured[targets[0]!.key]?.dueAt).toBe('2026-11-10T04:59:00.000Z');
    expect(s.store.captured[targets[0]!.key]?.failures).toBe(1);
  });

  it('saves results as they arrive, including when a run stops early', async () => {
    const s = setup({ frames: async (_ts, opts) => {
      await opts.onDone(done(t(1), found(1)));
      expect(s.store.captured[t(1).key]?.dueAt).toBeTruthy();
      throw new Error('frame host lost');
    } });
    expect(await runVisitPass(s.deps, [t(1), t(2)])).toEqual([found(1)]);
    expect(s.progress.at(-1)).toEqual([1, 2]);
  });

  it('does not start a frame host when there are no targets', async () => {
    const frames = vi.fn(async () => []);
    const s = setup({ frames });
    expect(await runVisitPass(s.deps, [])).toEqual([]);
    expect(frames).not.toHaveBeenCalled();
  });
});
