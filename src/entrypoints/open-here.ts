// Added to a frame of DueBoard's frame host by the frame reader, to run in the page's own world: a page that would open
// the assignment in a new tab opens it in this frame instead. Does nothing in a normal tab.
export default defineUnlistedScript(() => {
  if (window.top === window) return;
  const w = window as unknown as { __dueboardOpenHere?: boolean; open: (u?: string | URL) => Window | null };
  if (w.__dueboardOpenHere) return;
  w.__dueboardOpenHere = true;
  w.open = (u?: string | URL) => {
    if (u) location.assign(String(u));
    return null;
  };
});
