import { classifyLink } from './links';
import { ALL_SOURCES, type SourceId, type StoreShape } from './types';

const LABELS: Partial<Record<string, SourceId>> = { Gradescope: 'gradescope', Pearson: 'pearson' };

/**
 * Platforms a student's Brightspace courses link to. Brightspace is the one thing every student signs in to,
 * so it is where DueBoard learns which other platforms matter for this student.
 */
export function platformsInBrightspace(store: StoreShape): SourceId[] {
  const found = new Set<SourceId>();
  for (const l of store.snapshots.brightspace?.links ?? []) {
    const src = LABELS[classifyLink(l.title, l.url)?.label ?? ''];
    if (src) found.add(src);
  }
  return ALL_SOURCES.filter((s) => found.has(s));
}

/** Platforms worth telling the student about: Brightspace, plus ones linked from it or that already returned courses. */
export function relevantSources(store: StoreShape): SourceId[] {
  const linked = platformsInBrightspace(store);
  return ALL_SOURCES.filter(
    (s) => s === 'brightspace' || linked.includes(s) || (store.snapshots[s]?.courses.length ?? 0) > 0,
  );
}
