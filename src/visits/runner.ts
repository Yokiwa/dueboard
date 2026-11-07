import type { VisitMessage } from './messages';
import { originAllowed, type VisitOutcome, type VisitTarget } from './schedule';

export type Landing = { url: string } | 'closed' | 'timeout';

/** What the runner needs from the browser. The real one is in browserApi.ts; tests pass a fake. */
export interface VisitApi {
  /** A new window on about:blank, minimized and not focused. */
  openWindow(): Promise<{ windowId: number; tabId: number }>;
  navigate(tabId: number, url: string): Promise<void>;
  /** Resolves once the tab finished loading a page outside Brightspace, or a sign-in page. */
  waitForLanding(tabId: number, timeoutMs: number): Promise<Landing>;
  /** The platform host a Brightspace launch goes to, read from the launch page; null when it can't be told; 'signed_out' when Brightspace asks to sign in. */
  launchHost(url: string): Promise<string | null | 'signed_out'>;
  /** Whether the student is still signed in to Brightspace. */
  signedIn(): Promise<boolean>;
  /** The visit window: still minimized, opened by the student, or gone. */
  windowState(windowId: number): Promise<'minimized' | 'open' | 'gone'>;
  /** permissions.getAll().origins */
  granted(): Promise<string[]>;
  inject(tabId: number, mode: 'due' | 'syllabus', platform?: string): Promise<void>;
  nextMessage(tabId: number, timeoutMs: number): Promise<VisitMessage | 'timeout'>;
  closeWindow(windowId: number): Promise<void>;
  /** Persists visitState.windowId, so a restart can close a window a crashed run left behind. */
  remember(windowId: number | null): Promise<void>;
}

/** Brightspace's own sign-in page, Purdue's identity provider, and Duo. */
export const SIGN_IN = /\/d2l\/login|login\.purdue\.edu|\/idp\/profile\/|duosecurity\.com/i;
const BRIGHTSPACE_HOST = 'purdue.brightspace.com';

export interface RunOptions {
  perPageMs?: number;
  finderMs?: number;
  budgetMs?: number;
  now?: () => number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Opens each target's Brightspace launch, one at a time, in one minimized window, and reads the page it lands on.
 * Never clicks or types. The window is always closed at the end, on error and when the time budget runs out.
 */
export async function runVisits(targets: VisitTarget[], api: VisitApi, opts: RunOptions = {}): Promise<VisitOutcome[]> {
  if (targets.length === 0) return [];
  const perPageMs = opts.perPageMs ?? 20_000;
  const finderMs = opts.finderMs ?? 10_000;
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
      const outcome = await visit(t, granted).catch(async (): Promise<VisitOutcome | 'stop'> => ((await api.windowState(windowId)) === 'gone' ? 'stop' : { key: t.key, status: 'failed', reason: 'error' }));
      if (outcome === 'stop') break;
      out.push(outcome);
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
  async function visit(t: VisitTarget, granted: string[]): Promise<VisitOutcome | 'stop'> {
    if (t.mode !== 'session') {
      const host = await api.launchHost(t.launchUrl);
      if (host === 'signed_out') return { key: t.key, status: 'signed_out' };
      if (host && !originAllowed(granted, host)) return { key: t.key, status: 'needs_permission', host };
      if (!host) {
        if (!(await api.signedIn())) return { key: t.key, status: 'signed_out' };
        // Without knowing the site, only a known platform the student allowed may be opened.
        if (!t.platform) return { key: t.key, status: 'failed', reason: 'unknown' };
      }
    }
    await api.navigate(tabId, t.launchUrl);
    const landing = await api.waitForLanding(tabId, perPageMs);
    if (landing === 'closed') return 'stop';
    if (landing === 'timeout') return (await api.signedIn()) ? { key: t.key, status: 'failed', reason: 'timeout' } : { key: t.key, status: 'signed_out' };
    if (SIGN_IN.test(landing.url)) return { key: t.key, status: 'signed_out' };
    return read(t, new URL(landing.url).hostname);
  }

  async function read(t: VisitTarget, host: string): Promise<VisitOutcome> {
    if (t.mode === 'session') return { key: t.key, status: 'landed', host };
    if (host === BRIGHTSPACE_HOST) return { key: t.key, status: 'failed', reason: 'timeout' };
    if (!originAllowed(await api.granted(), host)) return { key: t.key, status: 'needs_permission', host };
    await api.inject(tabId, t.mode, t.platform);
    const msg = await api.nextMessage(tabId, finderMs + 2_000);
    if (msg === 'timeout') return { key: t.key, status: 'failed', reason: 'timeout' };
    if (msg.type === 'visitText') return { key: t.key, status: 'text', lines: msg.lines, host };
    return msg.found ? { key: t.key, status: 'found', found: msg.found, host } : { key: t.key, status: 'none', host };
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
