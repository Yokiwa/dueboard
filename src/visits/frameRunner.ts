import type { FrameApi } from './frame/api';
import type { FrameResult, FrameVisitRequest } from './frame/protocol';
import { stripUrl } from './messages';
import type { VisitLogEntry } from './runner';
import type { VisitOutcome, VisitTarget } from './schedule';

/** Text that means the frame got a sign-in or cookie prompt instead of the page (the window, with the student's cookies, may not). */
const PROMPT = /\b(sign|log)\s?in\b|cookies?\b.{0,40}\b(disabled|blocked|required|enable)|session (has )?expired/i;
const THIN = 200;
/** Read time of a sign-in visit's hidden frame (the reader looks for its next link for 35 s). */
const SESSION_READ_MS = 40_000;

/** The frame read nothing worth trusting: no page, a nearly blank one, or a sign-in / cookie prompt. */
function notThePage(pages: FrameResult['pages']): boolean {
  const text = pages.map((p) => p.text).join(' / ');
  return text.trim().length < THIN || PROMPT.test(text);
}

export interface FrameVisitDone {
  target: VisitTarget;
  outcome: VisitOutcome;
  /** True when the visit window should still try this target (nothing was read, or nothing was found). */
  fallback: boolean;
  /** Outcomes this visit gave to other waiting targets, from titles it listed on its page. */
  listed: VisitOutcome[];
  log: VisitLogEntry;
}

export interface FrameRunOptions {
  /** Targets with the same key never run at the same time (one platform = one key). */
  keyOf(t: VisitTarget): string;
  signedIn(): Promise<boolean>;
  /** True when no more targets of this key should start (they stay unstarted and are not in the result). */
  skipKey?(key: string): boolean;
  onDone(d: FrameVisitDone): Promise<void> | void;
  concurrency?: number;
  maxPages?: number;
  budgetMs?: number;
  now?: () => number;
}

let counter = 0;
const newToken = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

const blockedResult = (): FrameResult => ({ status: 'blocked', listed: [], frames: [], clicked: [], pages: [] });

/**
 * Reads many targets in hidden frames: at most `concurrency` at once and never two with the same keyOf. Each frame
 * result becomes the outcome the rest of the app knows. Titles a page lists date other waiting targets, which are then
 * not visited. Targets whose key `skipKey` reports are never started. After "signed out" no new visit starts; visits in flight finish. Targets never started (page limit,
 * time budget, signed out) are not in the result.
 */
export async function runFrameVisits(targets: VisitTarget[], api: FrameApi, opts: FrameRunOptions): Promise<FrameVisitDone[]> {
  if (targets.length === 0) return [];
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const maxPages = opts.maxPages ?? 60;
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + (opts.budgetMs ?? 480_000);

  const waiting = [...targets];
  const active = new Set<string>();
  const results: FrameVisitDone[] = [];
  let inflight = 0;
  let started = 0;
  let signedOut = false;

  const finish = async (d: FrameVisitDone) => {
    results.push(d);
    try {
      await opts.onDone(d);
    } catch (e) {
      // A failing consumer must not stall the run, but a result that was not saved should not vanish silently.
      console.warn('DueBoard: could not record a visit result', e);
    }
  };

  await api.begin();
  try {
    await new Promise<void>((resolve) => {
      const pump = () => {
        while (!signedOut && inflight < concurrency && started < maxPages && now() < deadline) {
          const i = waiting.findIndex((t) => !active.has(opts.keyOf(t)) && !opts.skipKey?.(opts.keyOf(t)));
          if (i < 0) break;
          const t = waiting.splice(i, 1)[0]!;
          const group = opts.keyOf(t);
          active.add(group);
          inflight++;
          started++;
          void guarded(t).finally(() => {
            active.delete(group);
            inflight--;
            pump();
          });
        }
        if (inflight === 0) resolve();
      };
      pump();
    });
  } finally {
    await api.end();
  }
  return results;

  /** run(), but a throw becomes a failed outcome for this target (if none was reported yet) and the slot is freed. */
  async function guarded(t: VisitTarget): Promise<void> {
    try {
      await run(t);
    } catch (e) {
      console.warn('DueBoard: frame visit failed', e);
      if (results.some((d) => d.target === t)) return;
      const outcome: VisitOutcome = { key: t.key, status: 'failed', reason: 'frame' };
      const log: VisitLogEntry = { at: new Date(now()).toISOString(), key: t.key, title: t.title, opened: stripUrl(t.launchUrl), frames: [], result: 'failed', detail: 'frame', mode: 'frame' };
      await finish({ target: t, outcome, fallback: true, listed: [], log });
    }
  }

  async function run(t: VisitTarget): Promise<void> {
    const req: FrameVisitRequest = { token: newToken(), url: t.launchUrl, mode: t.mode };
    if (t.platform) req.platform = t.platform;
    if (t.titles) req.titles = t.titles;
    // A sign-in visit waits for its page to show the next link (Pearson's portal loads slowly), then for the platform.
    if (t.mode === 'session') req.readMs = SESSION_READ_MS;
    const res = await (async () => api.visit(req))().catch(blockedResult);
    let { outcome, fallback } = await map(t, res);
    if (outcome.status === 'signed_out') signedOut = true;

    // Titles listed on this page: this target's own date turns a "nothing here" into a date; the other waiting targets
    // are dated without a visit of their own.
    const listed: { target: VisitTarget; outcome: VisitOutcome & { status: 'found' } }[] = [];
    if (res.host !== undefined) {
      for (const l of res.listed) {
        if (l.key === t.key) {
          if (outcome.status === 'none') {
            outcome = { key: t.key, status: 'found', found: l.found, host: res.host };
            fallback = false;
          }
          continue;
        }
        const j = waiting.findIndex((w) => w.key === l.key);
        if (j < 0) continue;
        const other = waiting.splice(j, 1)[0]!;
        listed.push({ target: other, outcome: { key: other.key, status: 'found', found: l.found, host: res.host } });
      }
    }

    const done: FrameVisitDone = { target: t, outcome, fallback, listed: listed.map((l) => l.outcome), log: logEntry(t, res, outcome) };
    await finish(done);
    for (const l of listed) {
      const log = logEntry(l.target, blockedResult(), l.outcome);
      log.site = res.host;
      log.detail = 'listed';
      await finish({ target: l.target, outcome: l.outcome, fallback: false, listed: [], log });
    }
  }

  async function map(t: VisitTarget, r: FrameResult): Promise<{ outcome: VisitOutcome; fallback: boolean }> {
    const key = t.key;
    const failed = async (): Promise<{ outcome: VisitOutcome; fallback: boolean }> =>
      (await opts.signedIn().catch(() => true))
        ? { outcome: { key, status: 'failed', reason: 'frame' }, fallback: true }
        : { outcome: { key, status: 'signed_out' }, fallback: false };
    switch (r.status) {
      // A hidden frame on a sign-in page is not proof the student is signed out (it may lack cookies): ask the browser.
      case 'signed_out':
      case 'blocked':
        return failed();
      default:
        // A result that read a page names its host; without one it is treated like blocked.
        if (r.host === undefined) return failed();
    }
    const host = r.host;
    switch (r.status) {
      case 'found':
        return r.found ? { outcome: { key, status: 'found', found: r.found, host }, fallback: false } : failed();
      case 'none':
        // A page read in full that shows no date has none in a window either. Only a page that needed a click (a
        // launcher opening the assignment in a new tab) may read better in the window, which follows new tabs.
        return { outcome: { key, status: 'none', host }, fallback: r.clicked.length > 0 || notThePage(r.pages) };
      case 'text':
        return { outcome: { key, status: 'text', lines: r.lines ?? [], host }, fallback: false };
      default:
        return { outcome: { key, status: 'landed', host, via: 'frame' }, fallback: false };
    }
  }

  function logEntry(t: VisitTarget, r: FrameResult, outcome: VisitOutcome): VisitLogEntry {
    const entry: VisitLogEntry = { at: new Date(now()).toISOString(), key: t.key, title: t.title, opened: stripUrl(t.launchUrl), frames: r.frames.map((f) => stripUrl(f.url)), result: outcome.status, mode: 'frame' };
    if ('host' in outcome) entry.site = outcome.host;
    else if (r.host) entry.site = r.host;
    if (r.landed) entry.landed = stripUrl(r.landed);
    if (r.clicked.length) entry.clicked = r.clicked;
    if (outcome.status === 'failed') entry.detail = outcome.reason;
    if (outcome.status === 'found') {
      entry.due = outcome.found.dueAt;
      entry.evidence = outcome.found.evidence;
    } else if (r.pages.length) entry.pages = r.pages;
    return entry;
  }
}
