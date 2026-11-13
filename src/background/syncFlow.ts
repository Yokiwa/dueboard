import type { Connector, SourceId, StoreShape } from '../core/types';
import type { SyncReport } from '../sync/runSync';
import { activeSourceIds } from './sources';
import { platformByHost } from '../core/platformRegistry';
import { dueVisits, type Trigger, type VisitOutcome, type VisitTarget } from '../visits/schedule';
import type { VisitProgress } from '../storage/store';

/**
 * One sync: the platforms known so far, then — in the same run — any platform the fresh Brightspace data just
 * revealed (e.g. a course that links to Pearson), so a new student sees everything after their first sync.
 */
export async function syncWithDiscovery(
  load: () => Promise<StoreShape>,
  make: (ids: SourceId[]) => Connector[],
  run: (connectors: Connector[]) => Promise<SyncReport>,
): Promise<SyncReport> {
  const before = activeSourceIds(await load());
  const report = await run(make(before));
  const added = activeSourceIds(await load()).filter((id) => !before.includes(id));
  if (added.length > 0) Object.assign(report, await run(make(added)));
  return report;
}

export interface SyncAndVisitDeps {
  load: () => Promise<StoreShape>;
  sync: () => Promise<SyncReport>;
  granted: () => Promise<string[]>;
  /** The visit pass: reads the targets, saves their results itself, and returns the final outcome per target. */
  visit: (targets: VisitTarget[]) => Promise<VisitOutcome[]>;
  save: (patch: Partial<StoreShape>) => Promise<void>;
  /** Reads syllabus files and checks course navigation bars; returns what changed. */
  syllabus?: (store: StoreShape) => Promise<Pick<StoreShape, 'syllabus' | 'syllabusNav'>>;
  /** Reads one background source again (after its sign-in was restored through Brightspace). */
  resync: (source: 'gradescope' | 'pearson', sessionHtml?: string) => Promise<SyncReport>;
  now: () => Date;
  /**
   * The dashboard's status line, kept for the whole run: Brightspace and the other sources, then syllabi; the visit
   * pass reports its own page count; null when the run has ended (however it ended).
   */
  status?: (p: VisitProgress | null) => Promise<void>;
}

/**
 * A full sync: read every source, then open the homework launches that still need a date (spec 3.2), then — if a
 * visit restored the Pearson session — read Pearson again. Visits are skipped while Brightspace is signed out.
 */
export interface SyncRun {
  /** Resolves once every source has been read (what the dashboard waits for). */
  report: Promise<SyncReport>;
  /** Resolves when the platform visits after it have finished too. */
  done: Promise<SyncReport>;
}

let running: (SyncRun & { trigger: Trigger }) | null = null;
let manualQueued = false;

/**
 * One full sync at a time. A sync asked for while another runs joins it, so there is never more than one visit
 * window; a Refresh that joins an automatic run gets a manual visit pass right after it.
 */
export function startSync(deps: SyncAndVisitDeps, trigger: Trigger): SyncRun {
  if (running) {
    if (trigger === 'manual' && running.trigger === 'auto') manualQueued = true;
    return running;
  }
  let report!: (r: SyncReport) => void;
  const reportP = new Promise<SyncReport>((r) => (report = r));
  const done = fullSync(deps, trigger, report).finally(() => {
    running = null;
    if (manualQueued) {
      manualQueued = false;
      void startSync(deps, 'manual').done;
    }
  });
  running = { report: reportP, done, trigger };
  return running;
}

/** The whole sync, visits included. */
export function syncAndVisit(deps: SyncAndVisitDeps, trigger: Trigger): Promise<SyncReport> {
  return startSync(deps, trigger).done;
}

async function fullSync(deps: SyncAndVisitDeps, trigger: Trigger, onReport: (r: SyncReport) => void): Promise<SyncReport> {
  const status = (p: VisitProgress | null) => (deps.status ? deps.status(p).catch(() => undefined) : Promise.resolve());
  await status({ done: 0, total: 0, phase: 'sources' });
  try {
    return await readAndVisit(deps, trigger, onReport, status);
  } finally {
    await status(null);
  }
}

async function readAndVisit(
  deps: SyncAndVisitDeps,
  trigger: Trigger,
  onReport: (r: SyncReport) => void,
  status: (p: VisitProgress | null) => Promise<unknown>,
): Promise<SyncReport> {
  let report: SyncReport = {};
  try {
    report = await deps.sync();
  } finally {
    onReport(report);
  }
  if (report.brightspace === 'not_logged_in') return report;
  if (deps.syllabus) {
    await status({ done: 0, total: 0, phase: 'syllabus' });
    const before = await deps.load();
    const patch = await deps.syllabus(before);
    if (Object.keys(patch.syllabus).length || Object.keys(patch.syllabusNav).length) {
      const latest = await deps.load();
      await deps.save({ syllabus: { ...latest.syllabus, ...patch.syllabus }, syllabusNav: { ...latest.syllabusNav, ...patch.syllabusNav } });
    }
  }
  const store = await deps.load();
  const targets = dueVisits(store, deps.now(), trigger, await deps.granted());
  if (targets.length === 0) return report;
  const sessions = targets.filter((target) => target.mode === 'session');
  const homework = targets.filter((target) => target.mode !== 'session');
  const visit = (ts: VisitTarget[]) => deps.visit(ts).catch((e: unknown) => {
    console.warn('DueBoard: platform visits stopped early', e);
    return [] as VisitOutcome[];
  });
  // Restore source sessions before the longer homework scan so source assignments arrive in this sync.
  const outcomes = await visit(sessions.length ? sessions : targets);
  await reconcile(outcomes);
  if (sessions.length && homework.length) await reconcile(await visit(homework));
  return report;

  async function reconcile(outcomes: VisitOutcome[]): Promise<void> {
    for (const src of ['gradescope', 'pearson'] as const) {
      if (report[src] === 'ok') continue;
      const session = outcomes.find((o) => o.key === `${src}:session`);
      const sessionTried = session?.status === 'landed' || session?.status === 'failed';
      const reached = outcomes.some((o) => 'host' in o && platformByHost(o.host)?.id === src);
      if (!sessionTried && !reached) continue;
      const html = session?.status === 'landed' ? session.sessionHtml : undefined;
      const again = html && src === 'pearson' ? await deps.resync(src, html) : await deps.resync(src);
      Object.assign(report, again);
      if (!session) continue;
      const { visitState } = await deps.load();
      const prev = visitState.sessions?.[src];
      const at = prev?.at ?? deps.now().toISOString();
      const ok = again[src] === 'ok';
      const failures = ok ? 0 : session.status === 'landed' ? (prev?.failures ?? 0) + 1 : prev?.failures ?? 1;
      // Retain failure diagnostics for older records; a failed session never enables window visits.
      const frame = ok ? undefined : session.status === 'landed' && session.via === 'frame' ? ('failed' as const) : prev?.frame;
      const entry = frame ? { at, failures, frame } : { at, failures };
      await deps.save({ visitState: { ...visitState, sessions: { ...visitState.sessions, [src]: entry } } });
    }
  }
}
