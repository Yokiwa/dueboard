import { browser } from 'wxt/browser';

/** HTML of the tab the user is looking at. Needs activeTab (granted by opening the popup) + scripting. */
export async function captureActivePage(): Promise<{ url: string; html: string }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('no active tab');
  const [res] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML,
  });
  if (typeof res?.result !== 'string') throw new Error('page not readable');
  return { url: tab.url, html: res.result };
}

/** Saves text as a file in the user's Downloads folder. */
export function downloadText(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
