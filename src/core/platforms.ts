import { BS_BASE, classifyLink } from './links';
import { platformByTitle, platformByHost, type PlatformDef } from './platformRegistry';
import { ALL_SOURCES, type SourceId, type StoreShape } from './types';

/** Registry ids that are DueBoard sources (read by background requests). */
const SOURCE_IDS: Partial<Record<string, SourceId>> = { gradescope: 'gradescope', pearson: 'pearson' };

/** The registry platform a Brightspace content link points to or launches, if any. */
export function platformOfLink(title: string, url: string): PlatformDef | undefined {
  if (!classifyLink(title, url)) return undefined;
  let host = '';
  try {
    host = new URL(url, BS_BASE).hostname;
  } catch {
    return undefined;
  }
  return host === new URL(BS_BASE).hostname ? platformByTitle(title) : platformByHost(host);
}

/** The source a Brightspace link launches, if it is one DueBoard reads by background requests. */
function sourceOf(title: string, url: string): SourceId | undefined {
  const def = platformOfLink(title, url);
  return def ? SOURCE_IDS[def.id] : undefined;
}

/**
 * Platforms a student's Brightspace courses link to. Brightspace is the one thing every student signs in to,
 * so it is where DueBoard learns which other platforms matter for this student.
 */
export function platformsInBrightspace(store: StoreShape): SourceId[] {
  const found = new Set<SourceId>();
  for (const l of store.snapshots.brightspace?.links ?? []) {
    const src = sourceOf(l.title, l.url);
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


/**
 * For each platform, the first course-content link that launches it from Brightspace (absolute URL).
 * Opening a platform this way signs the student in to it, which is how Purdue courses reach Gradescope,
 * Pearson and others — so sign-in prompts and shortcuts use it instead of the platform's own login page.
 */
export function launchLinks(store: StoreShape): Partial<Record<SourceId, string>> {
  const out: Partial<Record<SourceId, string>> = {};
  for (const l of store.snapshots.brightspace?.links ?? []) {
    const src = sourceOf(l.title, l.url);
    if (!src || out[src]) continue;
    const url = new URL(l.url, BS_BASE);
    if (url.origin === BS_BASE) out[src] = url.href;
  }
  return out;
}
