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
  /** The platform host a Brightspace launch goes to, read from the launch page; null when it can't be told. */
  launchHost(url: string): Promise<string | null>;
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

  const { windowId, tabId } = await api.openWindow();
  await api.remember(windowId);
  try {
    const granted = await api.granted();
    for (let i = 0; i < targets.length; i++) {
      if (now() >= deadline) break;
      const t = targets[i]!;
      if (t.mode !== 'session') {
        const host = await api.launchHost(t.launchUrl);
        if (host && !originAllowed(granted, host)) {
          out.push({ key: t.key, status: 'needs_permission', host });
          opts.onProgress?.(out.length, targets.length);
          continue;
        }
      }
      await api.navigate(tabId, t.launchUrl);
      const landing = await api.waitForLanding(tabId, perPageMs);
      if (landing === 'closed') {
        for (const rest of targets.slice(i)) out.push({ key: rest.key, status: 'failed', reason: 'closed' });
        break;
      }
      if (landing === 'timeout') {
        out.push({ key: t.key, status: 'failed', reason: 'timeout' });
      } else if (SIGN_IN.test(landing.url)) {
        out.push({ key: t.key, status: 'signed_out' });
        break;
      } else {
        out.push(await read(t, new URL(landing.url).hostname));
      }
      opts.onProgress?.(out.length, targets.length);
    }
  } finally {
    try {
      await api.closeWindow(windowId);
    } catch {
      // Already closed by the student.
    }
    await api.remember(null);
  }
  return out;

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

/** Closes a visit window left open by a run that died (browser restart, extension update). */
export async function closeLeftover(windowId: number | undefined, api: Pick<VisitApi, 'closeWindow' | 'remember'>): Promise<void> {
  if (windowId === undefined) return;
  try {
    await api.closeWindow(windowId);
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
