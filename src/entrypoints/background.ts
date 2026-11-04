import { createRouter } from '../background/router';
import { collectFixtures, probe } from '../diagnostics/probe';

export default defineBackground(() => {
  const route = createRouter({
    probe: () => probe(),
    collectFixtures: () => collectFixtures(),
  });

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const pending = route(msg);
    if (!pending) return undefined;
    pending.then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async answer
  });
});
