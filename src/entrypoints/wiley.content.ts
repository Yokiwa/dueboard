import { watchForWileyDue } from '../capture/wiley';

// On WileyPLUS assignment pages, note the assignment's due date so DueBoard can show it.
// Reads only the page heading and the "Due …" line; never clicks or changes anything.
export default defineContentScript({
  matches: ['https://education.wiley.com/*'],
  runAt: 'document_idle',
  main() {
    watchForWileyDue(document, (found) => {
      void browser.runtime.sendMessage({ type: 'captureDue', platform: 'wiley', ...found }).catch(() => undefined);
    });
  },
});
