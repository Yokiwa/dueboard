import { createFrameHost } from '../../visits/frame/host';
import { isReaderMessage, type FrameVisitRequest } from '../../visits/frame/protocol';
import { handleOffscreenMessage } from '../../sync/offscreenParser';
import { handleOffscreenSyllabus } from '../../sync/syllabusLines';

const host = createFrameHost(document);
window.addEventListener('message', (e) => host.onPost(e));

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as { target?: string; kind?: string; req?: FrameVisitRequest } | null;
  if (m && m.target === 'offscreen' && m.kind === 'frameVisit' && m.req) {
    void host.visit(m.req).then(sendResponse);
    return true; // answered when the visit ends
  }
  if (m && m.target === 'offscreen' && m.kind === 'frameReset') {
    host.reset();
    sendResponse(true);
    return undefined;
  }
  if (isReaderMessage(msg)) {
    sendResponse(host.onMessage(msg));
    return undefined;
  }
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
