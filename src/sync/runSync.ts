import { SOURCES, type Connector, type ConnectorFailureReason, type ConnectorResult, type SourceId, type StoreShape } from '../core/types';
import { recordSyncError, recordSyncSuccess, saveSnapshot } from '../storage/store';

export type SyncReport = Partial<Record<SourceId, 'ok' | ConnectorFailureReason>>;

let inflight: Promise<SyncReport> | null = null;

/**
 * Runs every connector in parallel, then writes results one after another (storage writes are
 * read-modify-write, so parallel writes could drop a snapshot). Concurrent callers share one run.
 */
export function runSync(connectors: Connector[], now: () => Date = () => new Date()): Promise<SyncReport> {
  if (inflight) return inflight;
  inflight = (async () => {
    const results = await Promise.all(
      connectors.map(async (c): Promise<[SourceId, ConnectorResult]> => {
        try {
          return [c.id, await c.fetchAll()];
        } catch (e) {
          return [c.id, { ok: false, reason: 'network', detail: String(e) }];
        }
      }),
    );
    const report: SyncReport = {};
    const at = now().toISOString();
    for (const [id, r] of results) {
      if (r.ok) {
        await saveSnapshot(id, { syncedAt: at, courses: r.courses, items: r.items, links: r.links, partial: r.partial });
        await recordSyncSuccess(id, at);
        report[id] = 'ok';
      } else {
        await recordSyncError(id, r.reason, r.detail);
        report[id] = r.reason;
      }
    }
    return report;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** True when any source was never tried, or the least recently tried one is older than maxAgeMs. */
export function isStale(syncMeta: StoreShape['syncMeta'], now: Date, maxAgeMs = 300_000): boolean {
  for (const s of SOURCES) {
    const meta = syncMeta[s];
    const attempts = [meta?.lastSuccess, meta?.lastError?.at].filter((x): x is string => Boolean(x)).map(Date.parse);
    if (attempts.length === 0) return true;
    if (now.getTime() - Math.max(...attempts) > maxAgeMs) return true;
  }
  return false;
}
