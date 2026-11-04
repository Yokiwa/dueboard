import { browser } from 'wxt/browser';

/** Sends a request to the background service worker (sync, syncIfStale, probe…). */
export function sendToBackground<T = unknown>(msg: { type: string } & Record<string, unknown>): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}
