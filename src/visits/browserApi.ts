import { browser } from 'wxt/browser';
import { IS_FIREFOX } from '../core/env';
import { setVisitWindow } from '../storage/store';
import { FINDER_FILE, stripUrl, type VisitMessage } from './messages';
import { launchTargetHost, SIGN_IN, type Landing, type VisitApi } from './runner';
import { installOpenHere } from './frame/openHere';

const BASE = 'https://purdue.brightspace.com';
const BRIGHTSPACE_HOST = new URL(BASE).hostname;

/** The tab visits run in; messages from any other tab are ignored. */
let visitTab: number | null = null;
/** Windows this background opened, and how each looked at the run's first check (once the system has settled it). */
const ours = new Set<number>();
const opened = new Map<number, { state?: string; focused?: boolean }>();
const queue: VisitMessage[] = [];
/** Frames that reported in during the current visit, and buttons they pressed (for the visit log). */
const frames: string[] = [];
const clicks: string[] = [];
const samples: { url: string; text: string; buttons: string[] }[] = [];
let waiter: ((m: VisitMessage) => void) | null = null;

/** Called by the background router for finder messages. Returns whether the message was taken. */
export function deliverVisitMessage(msg: VisitMessage, sender: { tab?: { id?: number } } | undefined): boolean {
  if (visitTab === null || sender?.tab?.id !== visitTab) return false;
  if (msg.type === 'visitFrame') {
    if (!frames.includes(msg.frameUrl)) frames.push(msg.frameUrl);
    return true;
  }
  if (msg.type === 'visitSample') {
    const i = samples.findIndex((x) => x.url === msg.frameUrl);
    const entry = { url: msg.frameUrl, text: msg.text, buttons: msg.buttons };
    if (i >= 0) samples[i] = entry;
    else if (samples.length < 6) samples.push(entry);
    return true;
  }
  if (msg.type === 'visitClick') {
    let host = '';
    try {
      host = new URL(msg.frameUrl).hostname;
    } catch {
      // keep empty
    }
    clicks.push(host ? `${msg.label} (${host})` : msg.label);
    return true;
  }
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(msg);
  } else queue.push(msg);
  return true;
}

/** Whether a tab is the visit tab (page captures from it are ignored: a visit records its own result). */
export function isVisitTab(tabId: number | undefined): boolean {
  return tabId !== undefined && tabId === visitTab;
}

/** Test hook: which tab currently accepts finder messages. */
export function setVisitTab(tabId: number | null): void {
  visitTab = tabId;
  queue.length = 0;
  frames.length = 0;
  clicks.length = 0;
  samples.length = 0;
  waiter = null;
}

function landed(url: string | undefined): boolean {
  if (!url || url === 'about:blank') return false;
  if (SIGN_IN.test(url)) return true;
  try {
    return new URL(url).hostname !== BRIGHTSPACE_HOST;
  } catch {
    return false;
  }
}

/** The tab is on `host` (a session visit's last step) or on a sign-in page (signed out: no point waiting). */
export function onHost(url: string | undefined, host: string): boolean {
  if (!url || url === 'about:blank') return false;
  if (SIGN_IN.test(url)) return true;
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

function onPage(url: string | undefined): boolean {
  if (!url || url === 'about:blank') return false;
  try {
    return new URL(url).hostname === BRIGHTSPACE_HOST || SIGN_IN.test(url);
  } catch {
    return false;
  }
}

export function createBrowserVisitApi(): VisitApi {
  return {
    async openWindow() {
      // Firefox can't open a window without focusing it; give focus back to the window the student was using.
      const before = IS_FIREFOX ? await browser.windows.getLastFocused().catch(() => undefined) : undefined;
      const win = await browser.windows.create({ url: 'about:blank', state: 'minimized', ...(IS_FIREFOX ? {} : { focused: false }), type: 'normal' });
      if (before?.id !== undefined) await browser.windows.update(before.id, { focused: true }).catch(() => undefined);
      const tabId = win?.tabs?.[0]?.id;
      if (win?.id === undefined || tabId === undefined) throw new Error('could not open the visit window');
      ours.add(win.id);
      setVisitTab(tabId);
      return { windowId: win.id, tabId };
    },

    async navigate(tabId, url) {
      queue.length = 0; // late messages from the previous page don't belong to this one
      frames.length = 0;
      clicks.length = 0;
      samples.length = 0;
      await browser.tabs.update(tabId, { url });
    },

    waitForLanding(tabId, timeoutMs, opts) {
      return new Promise<Landing>((resolve) => {
        let done = false;
        const finish = (r: Landing) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          browser.tabs.onUpdated.removeListener(onUpdated);
          browser.tabs.onRemoved.removeListener(onRemoved);
          resolve(r);
        };
        const onUpdated = (id: number, info: { status?: string }, tab: { url?: string; status?: string }) => {
          if (id !== tabId) return;
          if (info.status !== 'complete' && tab.status !== 'complete') return;
          // A Brightspace content page is itself the landing (the platform is embedded in it); else wait to leave it.
          const at = opts?.host ? onHost(tab.url, opts.host) : opts?.brightspacePage ? onPage(tab.url) : landed(tab.url);
          if (at) finish({ url: tab.url! });
        };
        const onRemoved = (id: number) => {
          if (id === tabId) finish('closed');
        };
        const timer = setTimeout(() => finish('timeout'), timeoutMs);
        browser.tabs.onUpdated.addListener(onUpdated);
        browser.tabs.onRemoved.addListener(onRemoved);
      });
    },

    async launchHost(url) {
      try {
        const res = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(15_000) });
        if (SIGN_IN.test(res.url)) return { host: 'signed_out' };
        const finalHost = new URL(res.url).hostname;
        if (finalHost !== BRIGHTSPACE_HOST) return { host: finalHost };
        const target = launchTargetHost(await res.text(), BASE);
        return target ? { host: target } : { host: null, note: `no launch target on ${stripUrl(res.url)} (HTTP ${res.status})` };
      } catch (e) {
        // A redirect to a site without access, offline, or a timeout: visit and see.
        return { host: null, note: `fetch failed: ${(e as Error)?.name ?? 'Error'}: ${(e as Error)?.message ?? String(e)}`.slice(0, 200) };
      }
    },

    async signedIn() {
      try {
        const versions = (await (await fetch(`${BASE}/d2l/api/versions/`, { credentials: 'include', signal: AbortSignal.timeout(15_000) })).json()) as { ProductCode: string; LatestVersion: string }[];
        const lp = versions.find((v) => v.ProductCode === 'lp')?.LatestVersion;
        if (!lp) return true;
        const res = await fetch(`${BASE}/d2l/api/lp/${lp}/users/whoami`, { credentials: 'include', signal: AbortSignal.timeout(15_000) });
        return res.ok && !SIGN_IN.test(res.url);
      } catch {
        return true; // offline or a hiccup: don't end the run on a guess
      }
    },

    async windowState(windowId) {
      try {
        const win = await browser.windows.get(windowId, { populate: true });
        if ((win.tabs?.length ?? 0) > 1) return 'open';
        // A change from how DueBoard opened it means the student took it over: un-minimized it or clicked into it.
        // Where the system couldn't minimize or unfocus it in the first place, nothing changes and visits go on.
        const was = opened.get(windowId);
        if (!was) {
          // First check of our own window: remember how the system shows it (some can't minimize or unfocus it).
          if (ours.has(windowId)) opened.set(windowId, { state: win.state, focused: win.focused });
          return 'minimized'; // ours, or left from an earlier run: a single tab is DueBoard's
        }
        if (was.state === 'minimized' && win.state !== 'minimized') return 'open';
        if (was.focused === false && win.focused) return 'open';
        return 'minimized';
      } catch {
        return 'gone';
      }
    },

    async framesSeen() {
      return [...frames];
    },

    async clicksSeen() {
      return [...clicks];
    },

    async samplesSeen() {
      return samples.map((x) => ({ ...x, buttons: [...x.buttons] }));
    },

    async granted() {
      return (await browser.permissions.getAll()).origins ?? [];
    },

    async inject(tabId, mode, platform) {
      // Homework visits may press "open the assignment"; sign-in visits one link (Pearson's Assignments).
      const allowOpen = mode === 'due' || mode === 'session';
      if (allowOpen) {
        // DueBoard's own hidden tab: a page that would open the assignment in a new tab opens it here instead.
        await browser.scripting
          .executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: installOpenHere })
          .catch(() => undefined);
      }
      await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (m: string, p: string | null, open: boolean) => {
          const w = window as unknown as { __dueboardMode?: string; __dueboardPlatform?: string; __dueboardAllowOpen?: boolean };
          w.__dueboardMode = m;
          if (p) w.__dueboardPlatform = p;
          w.__dueboardAllowOpen = open;
        },
        args: [mode, platform ?? null, allowOpen],
      });
      await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [FINDER_FILE] });
    },

    nextMessage(_tabId, timeoutMs) {
      const first = queue.shift();
      if (first) return Promise.resolve(first);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiter = null;
          resolve('timeout');
        }, timeoutMs);
        waiter = (m) => {
          clearTimeout(timer);
          resolve(m);
        };
      });
    },

    async closeWindow(windowId) {
      opened.delete(windowId);
      ours.delete(windowId);
      if (windowId !== undefined && visitTab !== null) setVisitTab(null);
      await browser.windows.remove(windowId);
    },

    async remember(windowId) {
      await setVisitWindow(windowId);
    },
  };
}
