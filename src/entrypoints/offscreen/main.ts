import { handleOffscreenMessage } from '../../sync/offscreenParser';
import { handleOffscreenSyllabus } from '../../sync/syllabusLines';

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const pending = handleOffscreenSyllabus(msg);
  if (pending) {
    void pending.then(sendResponse);
    return true; // answered asynchronously
  }
  const reply = handleOffscreenMessage(msg);
  if (reply === undefined) return undefined;
  sendResponse(reply);
  return undefined;
});
