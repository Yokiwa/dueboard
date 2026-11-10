import { startFrameReader } from '../visits/frame/reader';
import type { ReaderMessage } from '../visits/frame/protocol';
import { manifestOrigins } from '../core/platformRegistry';

// Declared for every platform site, in every frame. Does nothing in a normal tab: it only acts inside the frames of
// DueBoard's own hidden frame host page, where it runs the finder and reports through the background.
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
