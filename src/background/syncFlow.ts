import type { Connector, SourceId, StoreShape } from '../core/types';
import type { SyncReport } from '../sync/runSync';
import { activeSourceIds } from './sources';

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
