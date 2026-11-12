/**
 * Whether a runtime message came from one of the extension's own pages (popup, dashboard, offscreen document...) and not
 * from a content script running in a website. extensionPrefix is browser.runtime.getURL('').
 */
export function isOwnPageSender(sender: { url?: string; origin?: string } | undefined, extensionPrefix: string): boolean {
  if (!sender?.url || !extensionPrefix || !sender.url.startsWith(extensionPrefix)) return false;
  // A content-script sender carries the origin of the page it runs in.
  return sender.origin === undefined || `${sender.origin}/` === extensionPrefix;
}
