import type { StoreShape } from '../core/types';
import type { FrameRunOptions, FrameVisitDone } from '../visits/frameRunner';
import type { VisitLogEntry } from '../visits/runner';
import { applyOutcomes, type VisitOutcome, type VisitTarget } from '../visits/schedule';

/** Which platform a target belongs to for frame memory and for "one platform at a time". */
export function frameKey(t: VisitTarget, captured: StoreShape['captured']): string {
  return t.platform ?? captured[t.key]?.platform ?? `course:${t.courseId}`;
}

export interface VisitPassDeps {
  load(): Promise<StoreShape>;
  save(patch: Partial<StoreShape>): Promise<void>;
  now(): Date;
  frames(targets: VisitTarget[], opts: FrameRunOptions): Promise<FrameVisitDone[]>;
  signedIn(): Promise<boolean>;
  progress(done: number, total: number): void;
  log(e: VisitLogEntry): void;
}

/** Read every platform in hidden frames only. Never create tabs or windows, even for legacy settings. */
export async function runVisitPass(deps: VisitPassDeps, targets: VisitTarget[]): Promise<VisitOutcome[]> {
  if (targets.length === 0) return [];
  const start = await deps.load();
  const keys = new Map(targets.map((t) => [t.key, frameKey(t, start.captured)]));
  const final: VisitOutcome[] = [];
  let chain: Promise<void> = Promise.resolve();
  try {
    await deps.frames(targets, {
      keyOf: (t) => keys.get(t.key) ?? frameKey(t, start.captured),
      signedIn: deps.signedIn,
      // Ignore old skipUntil/session.frame verdicts: they meant "use a window", which is no longer allowed.
      onDone: (d) => {
        const save = chain.then(async () => {
          const store = await deps.load();
          await deps.save(applyOutcomes(store, targets, [d.outcome], deps.now()));
          final.push(d.outcome);
          deps.log(d.log);
          deps.progress(final.length, targets.length);
        });
        chain = save.catch(() => undefined);
        return save;
      },
    });
  } catch (e) {
    console.warn('DueBoard: background reading stopped early', e);
  }
  await chain;
  deps.progress(final.length, targets.length);
  return final;
}
