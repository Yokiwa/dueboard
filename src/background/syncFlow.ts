import type { Connector, SourceId, StoreShape } from '../core/types';
import type { SyncReport } from '../sync/runSync';
import { activeSourceIds } from './sources';
import { applyOutcomes, dueVisits, type Trigger, type VisitOutcome, type VisitTarget } from '../visits/schedule';

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
  visit: (targets: VisitTarget[]) => Promise<VisitOutcome[]>;
  save: (patch: Pick<StoreShape, 'captured' | 'visitState'>) => Promise<void>;
  resyncPearson: () => Promise<SyncReport>;
  now: () => Date;
}

/**
 * A full sync: read every source, then open the homework launches that still need a date (spec 3.2), then — if a
 * visit restored the Pearson session — read Pearson again. Visits are skipped while Brightspace is signed out.
 */
export async function syncAndVisit(deps: SyncAndVisitDeps, trigger: Trigger): Promise<SyncReport> {
  const report = await deps.sync();
  if (report.brightspace === 'not_logged_in') return report;
  const store = await deps.load();
  const targets = dueVisits(store, deps.now(), trigger, await deps.granted());
  if (targets.length === 0) return report;
  const outcomes = await deps.visit(targets);
  await deps.save(applyOutcomes(await deps.load(), targets, outcomes, deps.now()));
  if (outcomes.some((o) => o.key === 'pearson:session' && o.status === 'landed')) Object.assign(report, await deps.resyncPearson());
  return report;
}
