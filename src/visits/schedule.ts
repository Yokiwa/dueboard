import { buildDashboard } from '../core/dashboard';
import { launchLinks } from '../core/platforms';
import { hostMatches, platformByTitle } from '../core/platformRegistry';
import type { CapturedDue, RawItem, StoreShape } from '../core/types';
import type { FoundDue } from './finders/types';

export { applyOutcomes } from './apply';

export type Trigger = 'auto' | 'manual';
export interface VisitTarget {
  /** 'brightspace:topic:123', 'pearson:session', 'syllabus:<ou>' */
  key: string;
  title: string;
  courseId: string;
  launchUrl: string;
  /** Registry id guessed from the title or link. */
  platform?: string;
  mode: 'due' | 'session' | 'syllabus';
}
export type VisitOutcome =
  | { key: string; status: 'found'; found: FoundDue; host: string }
  | { key: string; status: 'none'; host: string }
  | { key: string; status: 'failed'; reason: 'timeout' | 'closed' }
  | { key: string; status: 'needs_permission'; host: string }
  | { key: string; status: 'text'; lines: string[]; host: string }
  | { key: string; status: 'landed'; host: string }
  | { key: string; status: 'signed_out' };

const H = 3_600_000;
export const MAX_VISITS = 25;

/** Whether the granted origin patterns (permissions.getAll().origins) cover a host. */
export function originAllowed(granted: string[], hostname: string): boolean {
  return granted.some((pattern) => {
    if (pattern === '<all_urls>') return true;
    const m = /^(?:\*|https?):\/\/([^/]+)\//.exec(pattern);
    if (!m) return false;
    return m[1] === '*' || hostMatches(m[1]!, hostname);
  });
}

/** When a captured entry is due for another visit; null = not now. Lower rank goes first. */
function rank(c: CapturedDue | undefined, now: number, trigger: Trigger, granted: string[]): number | null {
  if (!c) return 0;
  if (c.blocked) return originAllowed(granted, c.blocked) ? 0 : null;
  if (c.dueAt && Date.parse(c.dueAt) < now) return null;
  const age = now - Date.parse(c.checkedAt);
  const stamp = Date.parse(c.checkedAt) || 0;
  if ((c.failures ?? 0) >= 1) return age > 6 * H ? 1 + stamp : null;
  if (c.dueAt) return age > 24 * H ? 1 + stamp : null;
  if ((c.misses ?? 0) < 3) return age > 24 * H ? 1 + stamp : null;
  return trigger === 'manual' && age > H ? 1 + stamp : null;
}

/** The Brightspace launch to reopen when Pearson's session expired. */
function pearsonSession(store: StoreShape): VisitTarget | null {
  const meta = store.syncMeta.pearson;
  const err = meta?.lastError;
  if (err?.reason !== 'not_logged_in') return null;
  if (meta?.lastSuccess && Date.parse(meta.lastSuccess) >= Date.parse(err.at)) return null;
  const url = launchLinks(store).pearson;
  return url ? { key: 'pearson:session', title: 'Pearson', courseId: '', launchUrl: url, platform: 'pearson', mode: 'session' } : null;
}

/**
 * Which homework launches to open in the visit window this run. Candidates are undated Brightspace launch items (or
 * ones dated by an earlier visit); the captured entry decides when each is due again. See spec 3.2.
 */
export function dueVisits(store: StoreShape, now: Date, trigger: Trigger, granted: string[]): VisitTarget[] {
  const mode = store.settings.visits;
  if (mode === 'off' || (mode === 'manual' && trigger === 'auto')) return [];

  const raw = new Map<string, RawItem>();
  for (const r of store.snapshots.brightspace?.items ?? []) raw.set(`brightspace:${r.sourceItemId}`, r);

  const dash = buildDashboard(
    { snapshots: store.snapshots, manualItems: store.manualItems, manualLinks: store.manualLinks, userState: store.userState, captured: store.captured },
    now,
    { includeHidden: true },
  );
  const ranked: { target: VisitTarget; rank: number }[] = [];
  for (const item of dash.items) {
    if (item.submitted || item.doneByUser) continue;
    if (item.dueAt && item.dueFrom !== 'platform') continue;
    const key = item.sourceKeys.find((k) => k.startsWith('brightspace:topic:') && raw.get(k)?.launchUrl);
    if (!key) continue;
    const r = raw.get(key)!;
    const platform = platformByTitle(r.title);
    if (platform && (platform.reader === 'fetch' || platform.reader === 'none')) continue;
    // A known platform is visited only with access to its sites; an unknown one is visited to learn its site.
    if (platform && !platform.hosts.every((h) => originAllowed(granted, h.replace(/^\*\./, '')))) continue;
    const n = rank(store.captured[key], now.getTime(), trigger, granted);
    if (n === null) continue;
    const target: VisitTarget = { key, title: r.title, courseId: item.courseId, launchUrl: r.launchUrl!, mode: 'due' };
    if (platform) target.platform = platform.id;
    ranked.push({ target, rank: n });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const out = ranked.slice(0, MAX_VISITS).map((r) => r.target);
  const session = pearsonSession(store);
  return session ? [session, ...out] : out;
}
