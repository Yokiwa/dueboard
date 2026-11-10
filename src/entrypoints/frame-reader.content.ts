import { startFrameReader } from '../visits/frame/reader';
import type { ReaderMessage } from '../visits/frame/protocol';
import { manifestOrigins } from '../core/platformRegistry';

// Declared for every platform site, in every frame. Does nothing in a top-level tab. In a nested frame it only says
// hello to the top window (addressed to the extension origin) and stays silent unless DueBoard's frame host answers
// with an ack; then it runs the finder and reports through the background.
export default defineContentScript({
  matches: manifestOrigins(),
  allFrames: true,
  runAt: 'document_idle',
  main() {
    startFrameReader(window, {
      extensionOrigin: new URL(browser.runtime.getURL('/')).origin,
      send: (m: ReaderMessage) => browser.runtime.sendMessage(m),
      openHereUrl: browser.runtime.getURL('/open-here.js'),
    });
  },
});
