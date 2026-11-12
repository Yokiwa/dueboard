import { foldSnapshots } from '../core/completion';
import type { StoreShape } from '../core/types';

export { foldSnapshots };

/** After a sync: keeps what the sources said, across syncs (snapshots are rebuilt every time). */
export async function recordCompletion(load: () => Promise<StoreShape>, save: (patch: Partial<StoreShape>) => Promise<void>, now: Date): Promise<void> {
  const store = await load();
  await save({ completion: foldSnapshots(store.completion, store.snapshots, now) });
}
