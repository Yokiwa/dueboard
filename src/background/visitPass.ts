import type { StoreShape } from '../core/types';
import { platformByHost } from '../core/platformRegistry';
import type { FrameRunOptions, FrameVisitDone } from '../visits/frameRunner';
import type { VisitLogEntry } from '../visits/runner';
import { applyOutcomes, WINDOW_MAX, type VisitOutcome, type VisitTarget } from '../visits/schedule';

const DAY = 86_400_000;
/** Frame visits in a row that end blocked before a platform goes straight to the window. */
const BLOCKED_LIMIT = 3;
/** Pages in a row that the frames read but left to the window (a button they could not follow) within one run. */
const HANDED_LIMIT = 2;
const SKIP_DAYS = 7;

/** Which platform a target belongs to for frame memory and for "one platform at a time". */
export function frameKey(t: VisitTarget, captured: StoreShape['captured']): string {
  return t.platform ?? captured[t.key]?.platform ?? `course:${t.courseId}`;
}

export interface VisitPassDeps {
  load(): Promise<StoreShape>;
  save(patch: Partial<StoreShape>): Promise<void>;
  now(): Date;
  frames(targets: VisitTarget[], opts: FrameRunOptions): Promise<FrameVisitDone[]>;
  windows(targets: VisitTarget[], onLog: (e: VisitLogEntry) => void): Promise<VisitOutcome[]>;
  signedIn(): Promise<boolean>;
  progress(done: number, total: number): void;
  log(e: VisitLogEntry): void;
}

/**
 * One visit pass: hidden frames first, each result saved as it arrives; pages the frames could not read go to the
 * minimized window afterwards, in the same run. Applies its own outcomes and returns the final outcome per target.
 * Saves never overlap (frame results arrive concurrently), and the pass never looks at the trigger.
 */
export async function runVisitPass(deps: VisitPassDeps, targets: VisitTarget[]): Promise<VisitOutcome[]> {
  const total = targets.length;
  if (total === 0) return [];
  const start = await deps.load();
  const nowMs = deps.now().getTime();
  const windowFallback = start.settings.windowFallback !== false;
  const keys = new Map(targets.map((t) => [t.key, frameKey(t, start.captured)]));
  const keyOf = (t: VisitTarget) => keys.get(t.key) ?? frameKey(t, start.captured);

  const skipped = (k: string) => {
    const until = start.visitState.frame?.[k]?.skipUntil;
    return until !== undefined && Date.parse(until) > nowMs;
  };
  const direct: VisitTarget[] = [];
  const viaFrame: VisitTarget[] = [];
  for (const t of targets) {
    const sessionFailed = t.mode === 'session' && start.visitState.sessions?.[t.platform as 'gradescope' | 'pearson']?.frame === 'failed';
    // Without the window, a frame-failed session still goes to the frames (so it can recover); a skipped key waits.
    if (sessionFailed && !windowFallback) viaFrame.push(t);
    else (sessionFailed || skipped(keyOf(t)) ? direct : viaFrame).push(t);
  }

  let done = 0;
  const resolved = (n = 1) => {
    done = Math.min(total, done + n);
    deps.progress(done, total);
  };

  let chain: Promise<unknown> = Promise.resolve();
  /** One read-modify-write at a time. */
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn);
    chain = run.catch(() => undefined);
    return run;
  };
  const saveOutcomes = (outcomes: VisitOutcome[]) =>
    serial(async () => {
      const store = await deps.load();
      await deps.save(applyOutcomes(store, targets, outcomes, deps.now()));
    });

  const final: VisitOutcome[] = [];
  const pending: FrameVisitDone[] = []; // fallback results, in the order their frame visits finished
  let signedOut = false;
  /** Frame visits in a row that ended blocked, per key, in this pass. */
  const blockedNow = new Map<string, number>();
  /** Frame visits in a row that read a page and still handed it to the window, per key, in this pass. */
  const handedNow = new Map<string, number>();
  const skipNow = (k: string) => (blockedNow.get(k) ?? 0) >= BLOCKED_LIMIT || (windowFallback && (handedNow.get(k) ?? 0) >= HANDED_LIMIT);

  const remember = (store: StoreShape, d: FrameVisitDone): StoreShape['visitState'] => {
    const frame = { ...store.visitState.frame };
    const k = keyOf(d.target);
    const prev = frame[k];
    const o = d.outcome;
    if (o.status === 'failed' && o.reason === 'frame') {
      const blocked = (prev?.blocked ?? 0) + 1;
      frame[k] = blocked >= BLOCKED_LIMIT ? { blocked: 0, skipUntil: new Date(nowMs + SKIP_DAYS * DAY).toISOString() } : { blocked };
    } else if (o.status !== 'failed' && o.status !== 'signed_out' && prev) {
      frame[k] = { blocked: 0 };
    }
    return { ...store.visitState, frame };
  };

  const onDone = (d: FrameVisitDone) => {
    const hold = d.fallback && windowFallback;
    if (hold) pending.push(d);
    else final.push(d.outcome);
    if (d.outcome.status === 'signed_out') signedOut = true;
    const bk = keyOf(d.target);
    if (d.outcome.status === 'failed' && d.outcome.reason === 'frame') blockedNow.set(bk, (blockedNow.get(bk) ?? 0) + 1);
    else if (d.outcome.status !== 'failed' && d.outcome.status !== 'signed_out') blockedNow.delete(bk);
    // A page read in the frame that still goes to the window (WileyPLUS: its assignment opens only in a real window).
    const saidNothing = d.outcome.status === 'none' || (d.outcome.status === 'checked' && !d.outcome.check);
    if (saidNothing && d.fallback) handedNow.set(bk, (handedNow.get(bk) ?? 0) + 1);
    else if (d.outcome.status !== 'failed' && d.outcome.status !== 'signed_out') handedNow.delete(bk);
    deps.log(d.log);
    return serial(async () => {
      const store = await deps.load();
      const patch: Partial<StoreShape> = hold ? {} : applyOutcomes(store, targets, [d.outcome], deps.now());
      const visitState = remember({ ...store, ...patch } as StoreShape, d);
      await deps.save({ ...patch, visitState });
      if (!hold) resolved();
    });
  };

  try {
    await deps.frames(viaFrame, { keyOf, signedIn: deps.signedIn, onDone, skipKey: skipNow });
  } catch (e) {
    console.warn('DueBoard: background reading stopped early', e);
  }

  if (signedOut) return [...final, ...pending.map((d) => d.outcome)];

  // Targets the frames never started because their key hit the blocked limit in this pass go to the window.
  const reached = new Set(pending.map((d) => d.target.key));
  for (const d of final) reached.add(d.key);
  const dropped = viaFrame.filter((t) => skipNow(keyOf(t)) && !reached.has(t.key));
  let windowTargets: VisitTarget[] = [];
  if (windowFallback) windowTargets = [...direct, ...pending.map((d) => d.target), ...dropped].slice(0, WINDOW_MAX);
  let windowOutcomes: VisitOutcome[] = [];
  if (windowTargets.length > 0) {
    try {
      windowOutcomes = await deps.windows(windowTargets, (e) => {
        deps.log(e);
        resolved();
      });
    } catch (e) {
      console.warn('DueBoard: window visits stopped early', e);
    }
  }
  const trySave = (outcomes: VisitOutcome[]) =>
    saveOutcomes(outcomes).catch((e: unknown) => console.warn('DueBoard: could not save visit results', e));
  if (windowOutcomes.length > 0) await trySave(windowOutcomes);
  final.push(...windowOutcomes);

  // A page the frame tried and could not read but the window could (WileyPLUS opens its assignment only in a real
  // window): its platform goes straight to the window for a while instead of costing a frame visit every time. Keyed
  // as the next run will key it (the platform the window read it on, now in the captured entry).
  const tried = new Map(pending.map((d) => [d.target.key, d.target]));
  const learned = new Set<string>();
  for (const o of windowOutcomes) {
    const target = tried.get(o.key);
    // Homework only: the next run keys a homework by the platform it was read on (a syllabus by its course).
    const read = o.status === 'found' || (o.status === 'checked' && o.check !== null);
    if (!target || !read) continue;
    learned.add(target.platform ?? platformByHost(o.host)?.id ?? o.host);
  }
  if (learned.size > 0) {
    const skipUntil = new Date(nowMs + SKIP_DAYS * DAY).toISOString();
    await serial(async () => {
      const store = await deps.load();
      const frame = { ...store.visitState.frame };
      for (const k of learned) frame[k] = { blocked: 0, skipUntil };
      await deps.save({ visitState: { ...store.visitState, frame } });
    }).catch((e: unknown) => console.warn('DueBoard: could not save what the window read', e));
  }

  // A page the frame could not read and the window did not get to (page limit, time, a failed window run): the frame's
  // own result counts, once.
  const got = new Set(windowOutcomes.map((o) => o.key));
  const left = pending.filter((d) => !got.has(d.target.key));
  if (left.length > 0) {
    await trySave(left.map((d) => d.outcome));
    final.push(...left.map((d) => d.outcome));
  }
  done = Math.min(total, final.length);
  deps.progress(done, total);
  return final;
}
