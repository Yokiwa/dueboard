import { answerOf, foldAnswer } from '../core/completion';
import type { CompletionRecord, SourceId, StoreShape } from '../core/types';

const SOURCE_LABEL: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope', pearson: 'Pearson' };

/** The records after one sync: every raw item that answered "handed in or not" (or has a score) is folded in. */
export function foldSnapshots(completion: Record<string, CompletionRecord>, snapshots: StoreShape['snapshots'], now: Date): Record<string, CompletionRecord> {
  const out = { ...completion };
  for (const source of Object.keys(snapshots) as SourceId[]) {
    for (const raw of snapshots[source]?.items ?? []) {
      const answer = answerOf(raw, SOURCE_LABEL[source]);
      if (!answer) continue;
      const key = `${raw.source}:${raw.sourceItemId}`;
      const next = foldAnswer(out[key], answer, now);
      if (next) out[key] = next;
    }
  }
  return out;
}

/** After a sync: keeps what the sources said, across syncs (snapshots are rebuilt every time). */
export async function recordCompletion(load: () => Promise<StoreShape>, save: (patch: Partial<StoreShape>) => Promise<void>, now: Date): Promise<void> {
  const store = await load();
  await save({ completion: foldSnapshots(store.completion, store.snapshots, now) });
}
