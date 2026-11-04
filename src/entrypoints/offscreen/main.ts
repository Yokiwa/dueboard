import { handleOffscreenMessage } from '../../sync/offscreenParser';

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = handleOffscreenMessage(msg);
  if (reply === undefined) return undefined;
  sendResponse(reply);
  return undefined;
});
