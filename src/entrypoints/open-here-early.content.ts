import { manifestOrigins } from '../core/platformRegistry';
import { inExtensionFrame, installOpenHere } from '../visits/frame/openHere';

// Chrome only: in DueBoard's hidden frames, replaces window.open before the page's own scripts run, so a page that keeps
// its own copy of it still opens the assignment in the frame. Does nothing anywhere else (normal tabs, frames on websites).
export default defineContentScript({
  matches: manifestOrigins(),
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  include: ['chrome'],
  main() {
    if (inExtensionFrame(window)) installOpenHere(window);
  },
});
