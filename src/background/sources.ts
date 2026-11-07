import { relevantSources } from '../core/platforms';
import type { SourceId, StoreShape } from '../core/types';

/**
 * Which platforms to sync. Brightspace always. Gradescope is always checked quietly, because many courses use it
 * without linking it from Brightspace (a signed-out result is never shown unless it is relevant). Pearson only
 * once a course links to it or it has returned data.
 */
export function activeSourceIds(store: StoreShape): SourceId[] {
  const ids: SourceId[] = ['brightspace', 'gradescope'];
  if (relevantSources(store).includes('pearson')) ids.push('pearson');
  return ids;
}
