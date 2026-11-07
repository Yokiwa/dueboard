import { browser } from 'wxt/browser';
import { patchVisitState } from '../storage/store';
import { FINDER_FILE, type VisitMessage } from './messages';
import { launchTargetHost, SIGN_IN, type Landing, type VisitApi } from './runner';

const BASE = 'https://purdue.brightspace.com';
const BRIGHTSPACE_HOST = new URL(BASE).hostname;

/** The tab visits run in; messages from any other tab are ignored. */
let visitTab: number | null = null;
const queue: VisitMessage[] = [];
let waiter: ((m: VisitMessage) => void) | null = null;

/** Called by the background router for finder messages. Returns whether the message was taken. */
export function deliverVisitMessage(msg: VisitMessage, sender: { tab?: { id?: number } } | undefined): boolean {
  if (visitTab === null || sender?.tab?.id !== visitTab) return false;
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(msg);
  } else queue.push(msg);
  return true;
}

/** Test hook: which tab currently accepts finder messages. */
export function setVisitTab(tabId: number | null): void {
  visitTab = tabId;
  queue.length = 0;
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

export function createBrowserVisitApi(): VisitApi {
  return {
    async openWindow() {
      const win = await browser.windows.create({ url: 'about:blank', state: 'minimized', focused: false, type: 'normal' });
      const tabId = win?.tabs?.[0]?.id;
      if (win?.id === undefined || tabId === undefined) throw new Error('could not open the visit window');
      setVisitTab(tabId);
      return { windowId: win.id, tabId };
    },

    async navigate(tabId, url) {
      queue.length = 0; // late messages from the previous page don't belong to this one
      await browser.tabs.update(tabId, { url });
    },

    waitForLanding(tabId, timeoutMs) {
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
          if ((info.status === 'complete' || tab.status === 'complete') && landed(tab.url)) finish({ url: tab.url! });
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
        const res = await fetch(url, { credentials: 'include' });
        const finalHost = new URL(res.url).hostname;
        if (finalHost !== BRIGHTSPACE_HOST) return finalHost;
        return launchTargetHost(await res.text(), BASE);
      } catch {
        return null; // a redirect to a site without access, or offline: visit and see
      }
    },

    async granted() {
      return (await browser.permissions.getAll()).origins ?? [];
    },

    async inject(tabId, mode, platform) {
      await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (m: string, p: string | null) => {
          const w = window as unknown as { __dueboardMode?: string; __dueboardPlatform?: string };
          w.__dueboardMode = m;
          if (p) w.__dueboardPlatform = p;
        },
        args: [mode, platform ?? null],
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
      setVisitTab(null);
      await browser.windows.remove(windowId);
    },

    async remember(windowId) {
      await patchVisitState({ windowId: windowId ?? undefined });
    },
  };
}
