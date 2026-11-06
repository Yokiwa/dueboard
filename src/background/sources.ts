import { classifyLink } from '../core/links';
import type { SourceId, StoreShape } from '../core/types';

/** Which platforms to sync: Brightspace and Gradescope always; Pearson once a course links to it (or it synced before). */
export function activeSourceIds(store: StoreShape): SourceId[] {
  const ids: SourceId[] = ['brightspace', 'gradescope'];
  const linksPearson = (store.snapshots.brightspace?.links ?? []).some((l) => classifyLink(l.title, l.url)?.label === 'Pearson');
  if (linksPearson || store.snapshots.pearson || store.syncMeta.pearson) ids.push('pearson');
  return ids;
}
