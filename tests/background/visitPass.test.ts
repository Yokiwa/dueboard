import { describe, it, expect, vi } from 'vitest';
import { frameKey, runVisitPass, type VisitPassDeps } from '../../src/background/visitPass';
import { migrate } from '../../src/storage/store';
import type { StoreShape } from '../../src/core/types';
import { WINDOW_MAX, type VisitOutcome, type VisitTarget } from '../../src/visits/schedule';
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

function setup(over: { store?: StoreShape; frames?: VisitPassDeps['frames']; windows?: VisitPassDeps['windows'] } = {}) {
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
    windows: over.windows ?? (async () => []),
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

describe('runVisitPass: saving as it goes', () => {
  it('saves a frame result before the next visit finishes', async () => {
    const targets = [t(1), t(2)];
    let seen: unknown;
    const s = setup({
      frames: async (_ts, opts) => {
        await opts.onDone(done(targets[0]!, found(1)));
        seen = (await s.deps.load()).captured['brightspace:topic:1']?.dueAt;
        await opts.onDone(done(targets[1]!, found(2)));
        return [];
      },
    });
    const out = await runVisitPass(s.deps, targets);
    expect(seen).toBe('2026-11-10T04:59:00.000Z');
    expect(out.map((o) => o.key)).toEqual(['brightspace:topic:1', 'brightspace:topic:2']);
    expect(s.store.captured['brightspace:topic:2']?.dueAt).toBe('2026-11-10T04:59:00.000Z');
  });

  it('a pass cut short keeps earlier results', async () => {
    const s = setup({
      frames: async (_ts, opts) => {
        await opts.onDone(done(t(1), found(1)));
        throw new Error('worker died');
      },
    });
    await runVisitPass(s.deps, [t(1), t(2)]).catch(() => undefined);
    expect(s.store.captured['brightspace:topic:1']?.dueAt).toBeTruthy();
  });

  it('serializes saves: never two read-modify-write cycles at once', async () => {
    let active = 0;
    let peak = 0;
    const s = setup({
      frames: async (_ts, opts) => {
        await Promise.all([1, 2, 3].map((n) => opts.onDone(done(t(n), found(n)))));
        return [];
      },
    });
    const save = s.deps.save;
    s.deps.save = async (p) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      await save(p);
      active--;
    };
    await runVisitPass(s.deps, [t(1), t(2), t(3)]);
    expect(peak).toBe(1);
    expect(Object.keys(s.store.captured)).toHaveLength(3);
  });

  it('appends frame log entries one by one', async () => {
    const s = setup({ frames: scripted((ts) => ts.map((x) => done(x, found(x.key.split(':')[2]!)))) });
    await runVisitPass(s.deps, [t(1), t(2)]);
    expect(s.logs.map((l) => l.key)).toEqual(['brightspace:topic:1', 'brightspace:topic:2']);
  });
});

describe('runVisitPass: window fallback', () => {
  it('does not apply a fallback frame result when a window visit follows; the window outcome is applied once', async () => {
    const windows = vi.fn(async (_ts: VisitTarget[]) => [none(1)]);
    const s = setup({ frames: scripted(() => [done(t(1), none(1), true)]), windows });
    const out = await runVisitPass(s.deps, [t(1)]);
    expect(windows).toHaveBeenCalledWith([expect.objectContaining({ key: 'brightspace:topic:1' })], expect.any(Function));
    expect(s.store.captured['brightspace:topic:1']?.misses).toBe(1);
    expect(out).toEqual([none(1)]);
  });

  it('a window date wins over the frame miss', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), blocked(1), true)]), windows: async () => [found(1)] });
    await runVisitPass(s.deps, [t(1)]);
    expect(s.store.captured['brightspace:topic:1']).toMatchObject({ failures: 0, misses: 0, dueAt: '2026-11-10T04:59:00.000Z' });
  });

  it('with windowFallback off there is no window and frame outcomes are applied', async () => {
    const windows = vi.fn(async () => [] as VisitOutcome[]);
    const store = migrate({ settings: { windowFallback: false } });
    const s = setup({ store, frames: scripted(() => [done(t(1), none(1), true), done(t(2), blocked(2), true)]), windows });
    await runVisitPass(s.deps, [t(1), t(2), t(3, { platform: 'wiley' })]);
    expect(windows).not.toHaveBeenCalled();
    expect(s.store.captured['brightspace:topic:1']?.misses).toBe(1);
    expect(s.store.captured['brightspace:topic:2']?.failures).toBe(1);
  });

  it('with windowFallback off, a skipped key is dropped but a frame-failed session goes to the frame runner', async () => {
    const store = migrate({
      settings: { windowFallback: false },
      visitState: { frame: { aleks: { blocked: 0, skipUntil: '2026-11-10T00:00:00Z' } }, sessions: { pearson: { at: '2026-11-01T00:00:00Z', failures: 0, frame: 'failed' } } },
    });
    const session: VisitTarget = { key: 'pearson:session', title: 'Pearson', courseId: '', launchUrl: `${B}/p`, platform: 'pearson', mode: 'session' };
    const frames = vi.fn(async (_ts: VisitTarget[], _o: FrameRunOptions) => [] as FrameVisitDone[]);
    const windows = vi.fn(async () => [] as VisitOutcome[]);
    const s = setup({ store, frames, windows });
    await runVisitPass(s.deps, [t(1), session]);
    expect(windows).not.toHaveBeenCalled();
    expect(frames.mock.calls[0]![0].map((x) => x.key)).toEqual(['pearson:session']);
  });

  it('window targets: direct ones first (sessions, skipped keys), then fallbacks in finish order', async () => {
    const store = migrate({
      visitState: { frame: { aleks: { blocked: 0, skipUntil: '2026-11-10T00:00:00Z' } }, sessions: { pearson: { at: '2026-11-01T00:00:00Z', failures: 0, frame: 'failed' } } },
    });
    const session: VisitTarget = { key: 'pearson:session', title: 'Pearson', courseId: '', launchUrl: `${B}/p`, platform: 'pearson', mode: 'session' };
    const targets = [t(1, { platform: 'wiley' }), t(2), session, t(3, { platform: 'mathxl' }), t(4, { platform: 'cengage' })];
    const windows = vi.fn(async (_ts: VisitTarget[]) => [] as VisitOutcome[]);
    const s = setup({
      store,
      // finish order: 4, then 1; 3 reads fine
      frames: scripted((ts) => {
        expect(ts.map((x) => x.key)).toEqual(['brightspace:topic:1', 'brightspace:topic:3', 'brightspace:topic:4']);
        return [done(ts[2]!, blocked(4), true), done(ts[1]!, found(3)), done(ts[0]!, none(1), true)];
      }),
      windows,
    });
    await runVisitPass(s.deps, targets);
    expect(windows.mock.calls[0]![0].map((x) => x.key)).toEqual(['brightspace:topic:2', 'pearson:session', 'brightspace:topic:4', 'brightspace:topic:1']);
  });

  it('cuts the window list to WINDOW_MAX and applies the frame outcome of fallbacks that got no window', async () => {
    const targets = Array.from({ length: 30 }, (_, i) => t(i + 1, { platform: `p${i + 1}` }));
    const windows = vi.fn(async (ts: VisitTarget[]) => ts.map((x) => found(x.key.split(':')[2]!)));
    const s = setup({ frames: scripted((ts) => ts.map((x) => done(x, none(x.key.split(':')[2]!), true))), windows });
    const out = await runVisitPass(s.deps, targets);
    expect(windows.mock.calls[0]![0]).toHaveLength(WINDOW_MAX);
    expect(s.store.captured['brightspace:topic:1']?.dueAt).toBeTruthy();
    // item 30 never got a window: its frame miss is applied, once
    expect(s.store.captured['brightspace:topic:30']?.misses).toBe(1);
    expect(out).toHaveLength(30);
  });

  it('does not call windows when nothing needs one', async () => {
    const windows = vi.fn(async () => [] as VisitOutcome[]);
    const s = setup({ frames: scripted(() => [done(t(1), found(1))]), windows });
    await runVisitPass(s.deps, [t(1)]);
    expect(windows).not.toHaveBeenCalled();
  });

  it('applies the frame outcome when the window run fails outright', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), none(1), true)]), windows: async () => Promise.reject(new Error('no window')) });
    await runVisitPass(s.deps, [t(1)]);
    expect(s.store.captured['brightspace:topic:1']?.misses).toBe(1);
  });

  it('a window run that stops early: held frame results without a window outcome are applied exactly once', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), none(1), true), done(t(2), none(2), true), done(t(3), blocked(3), true)]), windows: async () => [none(1)] });
    const out = await runVisitPass(s.deps, [t(1), t(2), t(3)]);
    expect(s.store.captured['brightspace:topic:1']?.misses).toBe(1);
    expect(s.store.captured['brightspace:topic:2']?.misses).toBe(1);
    expect(s.store.captured['brightspace:topic:3']?.failures).toBe(1);
    expect(out.map((o) => o.key).sort()).toEqual(['brightspace:topic:1', 'brightspace:topic:2', 'brightspace:topic:3']);
  });

  it('a failing window save does not reject the pass; what can be applied still is', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), none(1), true), done(t(2), none(2), true)]), windows: async () => [found(1)] });
    const save = s.deps.save;
    let windowSave = true;
    s.deps.save = async (p) => {
      if (windowSave && p.captured?.['brightspace:topic:1']?.dueAt) {
        windowSave = false;
        throw new Error('disk full');
      }
      await save(p);
    };
    const out = await runVisitPass(s.deps, [t(1), t(2)]);
    expect(out.map((o) => o.key).sort()).toEqual(['brightspace:topic:1', 'brightspace:topic:2']);
    expect(s.store.captured['brightspace:topic:2']?.misses).toBe(1);
  });

  it('window log entries and progress pass through', async () => {
    const s = setup({
      frames: scripted(() => [done(t(1), none(1), true)]),
      windows: async (_ts, onLog) => {
        onLog({ ...log(t(1)), mode: 'window' });
        return [none(1)];
      },
    });
    await runVisitPass(s.deps, [t(1)]);
    expect(s.logs.map((l) => l.mode)).toEqual(['frame', 'window']);
  });
});

describe('runVisitPass: listed outcomes', () => {
  it('a target dated from another page is applied once and counted in progress', async () => {
    const windows = vi.fn(async () => [] as VisitOutcome[]);
    const listed = done(t(2, { platform: 'aleks' }), found(2));
    listed.log = { ...listed.log, detail: 'listed' };
    const s = setup({ frames: scripted(() => [done(t(1), found(1)), listed]), windows });
    const out = await runVisitPass(s.deps, [t(1), t(2)]);
    expect(out.map((o) => o.key)).toEqual(['brightspace:topic:1', 'brightspace:topic:2']);
    expect(s.store.captured['brightspace:topic:2']).toMatchObject({ dueAt: '2026-11-10T04:59:00.000Z', misses: 0 });
    expect(s.progress.at(-1)).toEqual([2, 2]);
    expect(windows).not.toHaveBeenCalled();
  });
});

describe('runVisitPass: signed out', () => {
  it('ends the pass: no window visits, nothing applied for pending fallbacks, outcomes so far returned', async () => {
    const windows = vi.fn(async () => [] as VisitOutcome[]);
    const signedOut: VisitOutcome = { key: 'brightspace:topic:2', status: 'signed_out' };
    const s = setup({ frames: scripted(() => [done(t(1), none(1), true), done(t(2), signedOut)]), windows });
    const out = await runVisitPass(s.deps, [t(1), t(2), t(3)]);
    expect(windows).not.toHaveBeenCalled();
    expect(s.store.captured['brightspace:topic:1']).toBeUndefined();
    expect(out).toContainEqual(signedOut);
  });
});

describe('runVisitPass: platform memory', () => {
  const memory = (store: StoreShape) => store.visitState.frame;
  it('once a key has 3 blocked results in this pass, its waiting targets go to the window, not the frames', async () => {
    const targets = [1, 2, 3, 4, 5].map((n) => t(n));
    const started: string[] = [];
    let windowed: string[] = [];
    const s = setup({
      frames: async (ts, opts) => {
        const out: FrameVisitDone[] = [];
        for (const x of ts) {
          if (opts.skipKey?.(opts.keyOf(x))) continue;
          started.push(x.key);
          const d = done(x, blocked(x.key.split(':')[2]!), true);
          out.push(d);
          await opts.onDone(d);
        }
        return out;
      },
      windows: async (ts) => {
        windowed = ts.map((x) => x.key);
        return ts.map((x) => found(x.key.split(':')[2]!));
      },
    });
    await runVisitPass(s.deps, targets);
    expect(started).toEqual(['1', '2', '3'].map((n) => `brightspace:topic:${n}`));
    expect(windowed).toEqual([1, 2, 3, 4, 5].map((n) => `brightspace:topic:${n}`));
  });

  it('dropped targets are not sent to the window when the window fallback is off', async () => {
    const targets = [1, 2, 3, 4].map((n) => t(n));
    let windowCalled = false;
    const store = migrate({});
    store.settings.windowFallback = false;
    const s = setup({
      store,
      frames: async (ts, opts) => {
        for (const x of ts) {
          if (opts.skipKey?.(opts.keyOf(x))) continue;
          await opts.onDone(done(x, blocked(x.key.split(':')[2]!), true));
        }
        return [];
      },
      windows: async () => ((windowCalled = true), []),
    });
    await runVisitPass(s.deps, targets);
    expect(windowCalled).toBe(false);
  });

  it('3 blocked in a row set skipUntil to now + 7 days and reset the count', async () => {
    const s = setup({ frames: scripted(() => [1, 2, 3].map((n) => done(t(n), blocked(n), true))) });
    await runVisitPass(s.deps, [t(1), t(2), t(3)]);
    expect(memory(s.store).aleks).toEqual({ blocked: 0, skipUntil: new Date(now.getTime() + 7 * 86_400_000).toISOString() });
  });

  it('counts blocked results across runs', async () => {
    const store = migrate({ visitState: { frame: { aleks: { blocked: 2 } } } });
    const s = setup({ store, frames: scripted(() => [done(t(1), blocked(1), true)]) });
    await runVisitPass(s.deps, [t(1)]);
    expect(memory(s.store).aleks?.skipUntil).toBeTruthy();
  });

  it.each([
    ['found', found(1)],
    ['none', none(1)],
    ['text', { key: 'brightspace:topic:1', status: 'text', lines: [], host: 'h' } as VisitOutcome],
    ['landed', { key: 'brightspace:topic:1', status: 'landed', host: 'h', via: 'frame' } as VisitOutcome],
  ])('a %s result resets the blocked count', async (_n, outcome) => {
    const store = migrate({ visitState: { frame: { aleks: { blocked: 2 } } } });
    const s = setup({ store, frames: scripted(() => [done(t(1), outcome, outcome.status === 'none')]) });
    await runVisitPass(s.deps, [t(1)]);
    expect(memory(s.store).aleks?.blocked).toBe(0);
  });

  it('a blocked result adds one to the count', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), blocked(1), true)]) });
    await runVisitPass(s.deps, [t(1)]);
    expect(memory(s.store).aleks).toEqual({ blocked: 1 });
  });
});

describe('runVisitPass: progress', () => {
  it('total is the number of targets; done grows by one per resolved item', async () => {
    const s = setup({
      frames: scripted(() => [done(t(1), found(1)), done(t(2), none(2), true)]),
      windows: async () => [none(2)],
    });
    await runVisitPass(s.deps, [t(1), t(2), t(3, { platform: 'wiley' })]);
    expect(s.progress.every(([, n]) => n === 3)).toBe(true);
    const dones = s.progress.map(([d]) => d);
    expect(dones).toEqual([...dones].sort((a, b) => a - b));
    expect(dones.at(-1)).toBe(2);
    expect(new Set(dones).size).toBe(dones.length);
  });
});

describe('runVisitPass: learning that only the window reads a platform', () => {
  const memory = (s: StoreShape) => s.visitState.frame ?? {};
  const week = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const wiley = (n: number): VisitOutcome => ({ key: `brightspace:topic:${n}`, status: 'found', host: 'education.wiley.com', found: { title: `HW ${n}`, dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due Nov 9' } });

  it('a page the frame could not date and the window could: its platform goes straight to the window for 7 days', async () => {
    // A Wiley homework has no platform from its title; its key is learned from where the window read it.
    const target = t(1, { platform: undefined });
    const s = setup({ frames: scripted(() => [done(target, { key: 'brightspace:topic:1', status: 'none', host: 'education.wiley.com' }, true)]), windows: async () => [wiley(1)] });
    await runVisitPass(s.deps, [target]);
    expect(memory(s.store).wileyplus).toEqual({ blocked: 0, skipUntil: week });
    // Next run: the captured platform names the key, so the frames are skipped.
    const next = vi.fn(async () => [] as FrameVisitDone[]);
    const windows = vi.fn(async () => [wiley(1)]);
    const s2 = setup({ store: s.store, frames: next, windows });
    await runVisitPass(s2.deps, [target]);
    expect(next).toHaveBeenCalledWith([], expect.anything());
    expect(windows).toHaveBeenCalledWith([expect.objectContaining({ key: 'brightspace:topic:1' })], expect.any(Function));
  });

  it('the same for a frame that failed and a window that found', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), blocked(1), true)]), windows: async () => [found(1)] });
    await runVisitPass(s.deps, [t(1)]);
    expect(memory(s.store).aleks).toEqual({ blocked: 0, skipUntil: week });
  });

  it('a syllabus the window read is not learned (its next run is keyed by course, not by platform)', async () => {
    const syl = t('s', { key: 'syllabus:9', mode: 'syllabus', platform: undefined, courseId: 'brightspace:9' });
    const s = setup({ frames: scripted(() => [done(syl, blocked('s'), true)]), windows: async () => [{ key: 'syllabus:9', status: 'text', lines: ['Oct 1 | Exam'], host: 'x.example.com' }] });
    await runVisitPass(s.deps, [syl]);
    expect(memory(s.store)['x.example.com']).toBeUndefined();
  });

  it('nothing is learned when the window found nothing either, or when the frame read the page itself', async () => {
    const s = setup({ frames: scripted(() => [done(t(1), none(1), true)]), windows: async () => [none(1)] });
    await runVisitPass(s.deps, [t(1)]);
    expect(memory(s.store).aleks?.skipUntil).toBeUndefined();
    const s2 = setup({ frames: scripted(() => [done(t(2), found(2))]) });
    await runVisitPass(s2.deps, [t(2)]);
    expect(memory(s2.store).aleks?.skipUntil).toBeUndefined();
  });
});

describe('runVisitPass: a platform the frames hand to the window, within one run', () => {
  const run = async (outcome: (n: string) => VisitOutcome, fallback: boolean) => {
    const started: string[] = [];
    let windowed: string[] = [];
    const s = setup({
      frames: async (ts, opts) => {
        for (const x of ts) {
          if (opts.skipKey?.(opts.keyOf(x))) continue;
          started.push(x.key);
          await opts.onDone(done(x, outcome(x.key.split(':')[2]!), fallback));
        }
        return [];
      },
      windows: async (ts) => {
        windowed = ts.map((x) => x.key);
        return ts.map((x) => found(x.key.split(':')[2]!));
      },
    });
    await runVisitPass(s.deps, [1, 2, 3, 4, 5].map((n) => t(n)));
    return { started, windowed };
  };

  it('after 2 pages in a row the frames read but left to the window (a button they could not follow), the rest go straight to the window', async () => {
    const { started, windowed } = await run(none, true);
    expect(started).toEqual(['1', '2'].map((n) => `brightspace:topic:${n}`));
    expect(windowed).toEqual([1, 2, 3, 4, 5].map((n) => `brightspace:topic:${n}`));
  });

  it('pages that were read in full (no window needed) do not count', async () => {
    const { started, windowed } = await run(none, false);
    expect(started.length).toBe(5);
    expect(windowed).toEqual([]);
  });
});

describe('runVisitPass: check visits', () => {
  const memory = (s: StoreShape) => s.visitState.frame ?? {};
  const week = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const ct = (n: number, extra: Partial<VisitTarget> = {}) => t(n, { mode: 'check', ...extra });
  const checked = (n: number, check: Extract<VisitOutcome, { status: 'checked' }>['check'], host = 'education.wiley.com'): VisitOutcome => ({ key: `brightspace:topic:${n}`, status: 'checked', check, host });
  const answer = { state: 'done' as const, by: 'score' as const, source: 'wileyplus', score: { text: '18/25', earned: 18, possible: 25, from: 'wileyplus' }, evidence: 'Score: 18/25' };

  it('a platform the window checked and the frame could not is learned like a found date', async () => {
    const target = ct(1, { platform: undefined });
    const s = setup({ frames: scripted(() => [done(target, checked(1, null), true)]), windows: async () => [checked(1, answer)] });
    await runVisitPass(s.deps, [target]);
    expect(memory(s.store).wileyplus).toEqual({ blocked: 0, skipUntil: week });
    expect(s.store.completion['brightspace:topic:1']).toMatchObject({ state: 'done', by: 'score', source: 'WileyPLUS' });
  });

  it('nothing is learned when the window could not tell either', async () => {
    const target = ct(1, { platform: undefined });
    const s = setup({ frames: scripted(() => [done(target, checked(1, null), true)]), windows: async () => [checked(1, null)] });
    await runVisitPass(s.deps, [target]);
    expect(memory(s.store).wileyplus?.skipUntil).toBeUndefined();
    // One try for the item, not two: the frame result was held for the window and the window's counts.
    expect(s.store.completion['brightspace:topic:1']).toMatchObject({ state: 'unknown', tries: 1 });
  });

  it('a frame check with no answer that the window should try counts toward handing the platform to the window', async () => {
    const started: string[] = [];
    let windowed: string[] = [];
    const s = setup({
      frames: async (ts, opts) => {
        for (const x of ts) {
          if (opts.skipKey?.(opts.keyOf(x))) continue;
          started.push(x.key);
          await opts.onDone(done(x, checked(Number(x.key.split(':')[2]), null, 'www.aleks.com'), true));
        }
        return [];
      },
      windows: async (ts) => {
        windowed = ts.map((x) => x.key);
        return ts.map((x) => checked(Number(x.key.split(':')[2]), answer, 'www.aleks.com'));
      },
    });
    await runVisitPass(s.deps, [1, 2, 3, 4].map((n) => ct(n)));
    expect(started).toHaveLength(2);
    expect(windowed).toHaveLength(4);
  });

  it('a frame check answered in full is saved at once and needs no window', async () => {
    const windows = vi.fn(async () => [] as VisitOutcome[]);
    const s = setup({ frames: scripted(() => [done(ct(1), checked(1, answer, 'www.aleks.com'))]), windows });
    await runVisitPass(s.deps, [ct(1)]);
    expect(windows).not.toHaveBeenCalled();
    expect(s.store.completion['brightspace:topic:1']).toMatchObject({ state: 'done', source: 'ALEKS' });
  });
});
