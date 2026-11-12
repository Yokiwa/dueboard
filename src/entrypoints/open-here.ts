import { installOpenHere } from '../visits/frame/openHere';

// Added to a frame of DueBoard's frame host by the frame reader, to run in the page's own world: a page that would open
// the assignment in a new tab opens it in this frame instead. Does nothing in a normal tab. (On Chrome the early copy,
// open-here-early, has usually installed it already.)
export default defineUnlistedScript(() => {
  if (window.top === window) return;
  installOpenHere(window);
});
