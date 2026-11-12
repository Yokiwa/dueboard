import { buildDashboard } from '../core/dashboard';
import { syllabusDue } from '../syllabus/sources';
import { launchLinks } from '../core/platforms';
import { platformByHost, platformById, platformByTitle } from '../core/platformRegistry';
import { originAllowed } from '../core/permissions';

export { originAllowed };
import type { CapturedDue, RawItem, StoreShape } from '../core/types';
import type { FoundDue } from './finders/types';
import type { ListedTitle } from './frame/protocol';

export { applyOutcomes } from './apply';

export type Trigger = 'auto' | 'manual';
export interface VisitTarget {
  /** 'brightspace:topic:123', 'gradescope:session', 'pearson:session', 'syllabus:<ou>' */
  key: string;
  title: string;
  courseId: string;
  /** The Brightspace launch link the visit opens as a full page. */
  launchUrl: string;
  /** A link to read ahead to learn which site the launch goes to, when it differs from launchUrl. */
  probeUrl?: string;
  /** Registry id guessed from the title or link. */
  platform?: string;
  mode: 'due' | 'session' | 'syllabus';
  /** Titles to look for on the page, with their keys, for frame visits that list several assignments at once. */
  titles?: ListedTitle[];
}
export type VisitOutcome =
  | { key: string; status: 'found'; found: FoundDue; host: string }
  | { key: string; status: 'none'; host: string }
  | { key: string; status: 'failed'; reason: 'timeout' | 'error' | 'unknown' | 'frame' }
  | { key: string; status: 'needs_permission'; host: string }
  | { key: string; status: 'text'; lines: string[]; host: string }
  | { key: string; status: 'landed'; host: string; via?: 'frame' }
  | { key: string; status: 'signed_out' };

const H = 3_600_000;
/** Opening these could start a timed or proctored attempt; they are never opened automatically. */
const NEVER_OPEN = /\b(quiz(?:zes)?|exams?|midterms?|tests?)\b/i;
/** The most visits one run plans (frame visits are cheap; the visit window takes WINDOW_MAX of them). */
export const MAX_VISITS = 60;
/** The most visits the visit window opens in one run. */
export const WINDOW_MAX = 25;
/** The most titles one frame visit looks for on a page. */
const MAX_TITLES = 40;

/** When a captured entry is due for another visit; null = not now. Lower rank goes first. */
function rank(c: CapturedDue | undefined, now: number, trigger: Trigger, granted: string[]): number | null {
  if (!c) return 0;
  // It landed on a platform DueBoard reads on its own (Gradescope, Pearson), and that page shows no date: its dates
  // come from that platform's own reading, so the link is not opened again.
  if (!c.dueAt && platformById(c.platform)?.reader === 'fetch') return null;
  if (c.blocked) return originAllowed(granted, c.blocked) ? 0 : null;
  if (c.dueAt && Date.parse(c.dueAt) < now) return null;
  const age = now - Date.parse(c.checkedAt);
  const stamp = Date.parse(c.checkedAt) || 0;
  if ((c.failures ?? 0) >= 3) return trigger === 'manual' && age > H ? 1 + stamp : null;
  if ((c.failures ?? 0) >= 1) return age > 6 * H ? 1 + stamp : null;
  if (c.dueAt) {
    // Dates rarely move: one more than 3 days off is read again every 3 days, a nearer one daily.
    const every = Date.parse(c.dueAt) - now > 72 * H ? 72 * H : 24 * H;
    return age > every ? 1 + stamp : null;
  }
  if ((c.misses ?? 0) < 3) return age > 24 * H ? 1 + stamp : null;
  return trigger === 'manual' && age > H ? 1 + stamp : null;
}

const SESSION_SOURCES = ['gradescope', 'pearson'] as const;
const LABEL: Record<(typeof SESSION_SOURCES)[number], string> = { gradescope: 'Gradescope', pearson: 'Pearson' };

/**
 * Platforms DueBoard reads in the background (Gradescope, Pearson) sign the student in through Brightspace. When one
 * reports "signed out" and any course has its Brightspace entry, that entry is opened once to sign back in: at most
 * every 6 h automatically, at once on Refresh; after 3 attempts that didn't help, on Refresh only.
 */
function sessionTargets(store: StoreShape, now: Date, trigger: Trigger): VisitTarget[] {
  const links = launchLinks(store);
  const out: VisitTarget[] = [];
  for (const src of SESSION_SOURCES) {
    const last = store.visitState.sessions?.[src];
    // Automatic syncs try at most every 6 hours; Refresh (the student asking) tries at once.
    if (last && trigger !== 'manual' && now.getTime() - Date.parse(last.at) < 6 * H) continue;
    if (last && last.failures >= 3 && trigger !== 'manual') continue;
    const meta = store.syncMeta[src];
    const err = meta?.lastError;
    if (err?.reason !== 'not_logged_in') continue;
    if (meta?.lastSuccess && Date.parse(meta.lastSuccess) >= Date.parse(err.at)) continue;
    const url = links[src];
    if (url) out.push({ key: `${src}:session`, title: LABEL[src], courseId: '', launchUrl: url, platform: src, mode: 'session' });
  }
  return out;
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
    { snapshots: store.snapshots, manualItems: store.manualItems, manualLinks: store.manualLinks, userState: store.userState, captured: store.captured, completion: store.completion },
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
    if (NEVER_OPEN.test(r.title)) continue;
    const platform = platformByTitle(r.title);
    if (platform && (platform.reader === 'fetch' || platform.reader === 'none' || platform.neverOpen)) continue;
    // A known platform is visited only with access to its sites; an unknown one (or one with no known host) is
    // visited to learn its site.
    if (platform && platform.hosts.length > 0 && !platform.hosts.every((h) => originAllowed(granted, h.replace(/^\*\./, '')))) continue;
    const n = rank(store.captured[key], now.getTime(), trigger, granted);
    if (n === null) continue;
    // Opened as a full page (like "Open in new window"): platforms refuse to show inside Brightspace's own frame.
    const target: VisitTarget = { key, title: r.title, courseId: item.courseId, launchUrl: r.launchUrl!, mode: 'due' };
    if (platform) target.platform = platform.id;
    ranked.push({ target, rank: n });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const syllabi = syllabusDue(store, now)
    .filter((src) => src.kind === 'visit')
    .map((src): VisitTarget => {
      const t: VisitTarget = { key: `syllabus:${src.ou}`, title: src.title, courseId: `brightspace:${src.ou}`, launchUrl: src.url, mode: 'syllabus' };
      const def = platformByHost(new URL(src.url).hostname);
      if (def) t.platform = def.id;
      return t;
    });
  const out = [...ranked.map((r) => r.target), ...syllabi].slice(0, MAX_VISITS);
  // One visit to a course page can date every assignment it lists: each homework target gets its course's titles.
  const due = out.filter((t) => t.mode === 'due');
  for (const t of due) {
    // The target itself first, so one past the cap still looks for its own title.
    const same = due.filter((o) => o.courseId === t.courseId && o !== t);
    t.titles = [t, ...same.slice(0, MAX_TITLES - 1)].map((o) => ({ key: o.key, title: o.title }));
  }
  return [...sessionTargets(store, now, trigger), ...out];
}
