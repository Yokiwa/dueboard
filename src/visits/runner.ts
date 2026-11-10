import { stripUrl, type VisitMessage } from './messages';
import { originAllowed, type VisitOutcome, type VisitTarget } from './schedule';

export type Landing = { url: string } | 'closed' | 'timeout';

/** What the runner needs from the browser. The real one is in browserApi.ts; tests pass a fake. */
export interface VisitApi {
  /** A new window on about:blank, minimized and not focused. */
  openWindow(): Promise<{ windowId: number; tabId: number }>;
  navigate(tabId: number, url: string): Promise<void>;
  /**
   * Resolves once the tab finished loading a page outside Brightspace, or a sign-in page. With brightspacePage, the
   * target is a Brightspace content page (the platform is embedded in it), so that page loading is the landing.
   */
  waitForLanding(tabId: number, timeoutMs: number, opts?: { brightspacePage?: boolean }): Promise<Landing>;
  /**
   * The platform host a Brightspace launch goes to, read from the launch page: null when it can't be told (with a note
   * saying why, for the visit log); 'signed_out' when Brightspace asks to sign in.
   */
  launchHost(url: string): Promise<{ host: string | null | 'signed_out'; note?: string }>;
  /** Whether the student is still signed in to Brightspace. */
  signedIn(): Promise<boolean>;
  /** The visit window: still minimized, opened by the student, or gone. */
  windowState(windowId: number): Promise<'minimized' | 'open' | 'gone'>;
  /** permissions.getAll().origins */
  granted(): Promise<string[]>;
  inject(tabId: number, mode: 'due' | 'syllabus' | 'score', platform?: string): Promise<void>;
  nextMessage(tabId: number, timeoutMs: number): Promise<VisitMessage | 'timeout'>;
  closeWindow(windowId: number): Promise<void>;
  /** Frames that reported in since the last navigation (stripped addresses), for the visit log. */
  framesSeen(tabId: number): Promise<string[]>;
  /** "Open the assignment" buttons pressed since the last navigation ("label (host)"), for the visit log. */
  clicksSeen(tabId: number): Promise<string[]>;
  /** What pages that found no date showed (text sample, buttons), for the visit log. */
  samplesSeen(tabId: number): Promise<PageSample[]>;
  /** Persists visitState.windowId, so a restart can close a window a crashed run left behind. */
  remember(windowId: number | null): Promise<void>;
}

/** Brightspace's own sign-in page, Purdue's identity provider, and Duo. */
export const SIGN_IN = /\/d2l\/login|login\.purdue\.edu|\/idp\/profile\/|duosecurity\.com/i;
const BRIGHTSPACE_HOST = 'purdue.brightspace.com';

export interface PageSample {
  url: string;
  text: string;
  buttons: string[];
}

/** One line of the visit log: what a visit saw, step by step. Addresses are stripped of "?…" and "#…". */
export interface VisitLogEntry {
  at: string;
  key: string;
  title: string;
  /** The site the Brightspace link goes to, as read from the link ('signed_out' if Brightspace asked to sign in). */
  site?: string;
  /** Why the site couldn't be told from the link. */
  siteNote?: string;
  opened: string;
  /** Where the page ended up, or 'timeout' / 'closed'. */
  landed?: string;
  /** Frames of the page that loaded and were read. */
  frames: string[];
  /** "Open the assignment" buttons DueBoard pressed. */
  clicked?: string[];
  /** What the pages showed when no date was found. */
  pages?: PageSample[];
  /** The date read, and the text it came from. */
  due?: string;
  /** The score read, as shown (score visits). */
  score?: string;
  evidence?: string;
  result: VisitOutcome['status'];
  detail?: string;
}

export interface RunOptions {
  perPageMs?: number;
  finderMs?: number;
  budgetMs?: number;
  /** How long one reader injection may take before the round goes on without it (default 5 s). */
  injectMs?: number;
  now?: () => number;
  onProgress?: (done: number, total: number) => void;
  onLog?: (entry: VisitLogEntry) => void;
}

/**
 * Opens each target's Brightspace launch, one at a time, in one minimized window, and reads the page it lands on.
 * Never types; the only button ever pressed is a platform's "open the assignment" (see finders/open.ts). The window
 * is always closed at the end, on error and when the time budget runs out.
 */
export async function runVisits(targets: VisitTarget[], api: VisitApi, opts: RunOptions = {}): Promise<VisitOutcome[]> {
  if (targets.length === 0) return [];
  const perPageMs = opts.perPageMs ?? 20_000;
  // Platforms reached through Brightspace load in steps (sign-in hand-off, launcher, assignment): give them time.
  const finderMs = opts.finderMs ?? 20_000;
  const injectMs = opts.injectMs ?? 5_000;
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + (opts.budgetMs ?? 300_000);
  const out: VisitOutcome[] = [];
  let leaveOpen = false;

  const { windowId, tabId } = await api.openWindow();
  await api.remember(windowId);
  try {
    const granted = await api.granted();
    for (const t of targets) {
      if (now() >= deadline) break;
      // The student closed the window (stop; next sync continues) or opened it to look (stop; leave it to them).
      const state = await api.windowState(windowId);
      if (state === 'gone') break;
      if (state === 'open') {
        leaveOpen = true;
        break;
      }
      const trace: Partial<VisitLogEntry> = {};
      const outcome = await visit(t, granted, trace).catch(async (): Promise<VisitOutcome | 'stop'> => ((await api.windowState(windowId)) === 'gone' ? 'stop' : { key: t.key, status: 'failed', reason: 'error' }));
      if (outcome === 'stop') break;
      out.push(outcome);
      if (opts.onLog) {
        const entry: VisitLogEntry = { at: new Date(now()).toISOString(), key: t.key, title: t.title, ...trace, opened: stripUrl(t.launchUrl), frames: await api.framesSeen(tabId).catch(() => []), result: outcome.status } as VisitLogEntry;
        if (outcome.status === 'failed') entry.detail = outcome.reason;
        if (outcome.status === 'found') {
          entry.due = outcome.found.dueAt;
          entry.evidence = outcome.found.evidence;
        }
        if (outcome.status === 'score' && outcome.score) entry.score = outcome.score.text;
        const clicked = await api.clicksSeen(tabId).catch(() => []);
        if (clicked.length) entry.clicked = clicked;
        if (outcome.status !== 'found' && !(outcome.status === 'score' && outcome.score)) {
          const pages = await api.samplesSeen(tabId).catch(() => []);
          if (pages.length) entry.pages = pages;
        }
        opts.onLog(entry);
      }
      opts.onProgress?.(out.length, targets.length);
      if (outcome.status === 'signed_out') break;
    }
  } finally {
    if (!leaveOpen) {
      try {
        await api.closeWindow(windowId);
      } catch {
        // Already closed by the student.
      }
    }
    await api.remember(null);
  }
  return out;

  /** One target; 'stop' ends the run without blaming this item (window closed). */
  async function visit(t: VisitTarget, granted: string[], trace: Partial<VisitLogEntry>): Promise<VisitOutcome | 'stop'> {
    let site: string | null = null;
    if (t.mode !== 'session') {
      const probe = await api.launchHost(t.probeUrl ?? t.launchUrl);
      const host = probe.host;
      if (host) trace.site = host;
      if (probe.note) trace.siteNote = probe.note;
      site = host === 'signed_out' ? null : host;
      if (host === 'signed_out') return { key: t.key, status: 'signed_out' };
      if (host && !originAllowed(granted, host)) return { key: t.key, status: 'needs_permission', host };
      if (!host) {
        if (!(await api.signedIn())) return { key: t.key, status: 'signed_out' };
        // Purdue's launch links never reveal their site ahead of time. A homework link is the student's own Brightspace
        // link, so it is opened anyway, and only pages on sites the student allowed are read. Other links (syllabus)
        // are opened only for a known platform the student allowed.
        if (!t.platform && t.mode !== 'due' && t.mode !== 'score') return { key: t.key, status: 'failed', reason: 'unknown' };
      }
    }
    await api.navigate(tabId, t.launchUrl);
    const landing = await api.waitForLanding(tabId, perPageMs);
    trace.landed = typeof landing === 'string' ? landing : stripUrl(landing.url);
    if (landing === 'closed') return 'stop';
    if (landing === 'timeout') return (await api.signedIn()) ? { key: t.key, status: 'failed', reason: 'timeout' } : { key: t.key, status: 'signed_out' };
    if (SIGN_IN.test(landing.url)) return { key: t.key, status: 'signed_out' };
    return read(t, new URL(landing.url).hostname, site);
  }

  async function read(t: VisitTarget, host: string, site: string | null): Promise<VisitOutcome> {
    if (t.mode === 'session') return { key: t.key, status: 'landed', host };
    if (host === BRIGHTSPACE_HOST) return { key: t.key, status: 'failed', reason: 'timeout' };
    if (!originAllowed(await api.granted(), host)) return { key: t.key, status: 'needs_permission', host };
    void site;

    // A platform reached through Brightspace loads in steps (sign-in hand-off, launcher, assignment), in this page or
    // its frames, so the reader is injected again every round (frames already reading ignore it), and a "nothing
    // here" from one step doesn't end the wait: the assignment may still appear.
    const rounds = Math.max(1, Math.ceil((finderMs + 2_000) / ROUND_MS));
    let sawNothing = false;
    for (let i = 0; i < rounds; i++) {
      // Firefox can leave an injection pending for good while one of the page's frames is still loading (an empty or
      // slow frame never reaches "idle"). Frames that are ready have the reader by then, so the round goes on.
      await settleWithin(api.inject(tabId, t.mode, t.platform), injectMs);
      const msg = await api.nextMessage(tabId, ROUND_MS);
      if (msg === 'timeout' || msg.type === 'visitFrame' || msg.type === 'visitClick' || msg.type === 'visitSample') continue;
      if (msg.type === 'visitText') return { key: t.key, status: 'text', lines: msg.lines, host };
      if (msg.type === 'visitScore') {
        if (msg.score) return { key: t.key, status: 'score', score: msg.score, host: frameHost(msg.frameUrl) ?? host };
        sawNothing = true;
        continue;
      }
      if (msg.found) return { key: t.key, status: 'found', found: msg.found, host: frameHost(msg.frameUrl) ?? host };
      sawNothing = true;
    }
    return sawNothing ? (t.mode === 'score' ? { key: t.key, status: 'score', score: null, host } : { key: t.key, status: 'none', host }) : { key: t.key, status: 'failed', reason: 'timeout' };
  }
}

const ROUND_MS = 2_500;

/** Waits for `work` (and passes on its error) for at most `ms`; after that, goes on as if it had finished. */
function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
  return Promise.race([work.then(() => undefined), late]).finally(() => clearTimeout(timer));
}
function frameHost(url: string): string | null {
  try {
    const h = new URL(url).hostname;
    return h && h !== BRIGHTSPACE_HOST ? h : null;
  } catch {
    return null;
  }
}

/**
 * Closes a visit window left open by a run that died (service-worker restart, extension update). Only a window that
 * still looks like a visit window (minimized, one tab) is closed, never one the student is using.
 */
export async function closeLeftover(windowId: number | undefined, api: Pick<VisitApi, 'closeWindow' | 'remember' | 'windowState'>): Promise<void> {
  if (windowId === undefined) return;
  try {
    if ((await api.windowState(windowId)) === 'minimized') await api.closeWindow(windowId);
  } catch {
    // Gone already.
  }
  await api.remember(null);
}

/**
 * Brightspace launch pages hand off to the platform with an auto-submitted form (LTI 1.1) or a scripted redirect
 * (LTI 1.3 login). The first absolute https target outside Brightspace names the platform's host.
 */
export function launchTargetHost(html: string, base: string): string | null {
  const own = new URL(base).hostname;
  const candidates = [
    ...Array.from(html.matchAll(/<form\b[^>]*\baction\s*=\s*["']([^"']+)["']/gi), (m) => m[1]!),
    ...Array.from(html.matchAll(/location(?:\.href)?\s*=\s*["']([^"']+)["']/gi), (m) => m[1]!),
    ...Array.from(html.matchAll(/http-equiv\s*=\s*["']refresh["'][^>]*url=([^"'>\s]+)/gi), (m) => m[1]!),
  ];
  for (const raw of candidates) {
    const url = raw.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (!/^https:\/\//i.test(url)) continue;
    try {
      const host = new URL(url).hostname;
      if (host !== own) return host;
    } catch {
      // Not a URL.
    }
  }
  return null;
}
