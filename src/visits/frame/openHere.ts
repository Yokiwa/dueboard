// Runs in the page's own world, inside DueBoard's hidden frames only: an assignment a page would open in a new tab or
// window opens in this frame instead, where DueBoard can read it.

type OpenWindow = { open: (u?: string | URL, target?: string) => unknown; location: { assign(u: string): void }; top: unknown; __dueboardOpenHere?: boolean };

/**
 * Chrome lists the origins of all ancestors, the top page last. A frame whose top page is an extension page is one of
 * DueBoard's hidden frames (no website can be the top page there). Firefox has no list: there the frame reader adds
 * the script after DueBoard's handshake instead.
 */
export function inExtensionFrame(win: Window): boolean {
  if (win.top === win) return false;
  const list = (win.location as { ancestorOrigins?: ArrayLike<string> }).ancestorOrigins;
  if (!list || list.length === 0) return false;
  return /^(chrome|moz)-extension:\/\//.test(list[list.length - 1]!);
}

/**
 * Replaces window.open. An address loads in this frame. The returned stand-in takes what pages do with a popup they
 * opened empty (set its location, write a "loading" note, focus it), so an address given afterwards loads here too.
 * Self-contained (no outside names), so it can also be injected as is into the visit window's pages.
 */
export function installOpenHere(win: Window = window): void {
  const w = win as unknown as OpenWindow;
  if (w.__dueboardOpenHere) return;
  w.__dueboardOpenHere = true;
  const go = (u: unknown) => {
    const s = String(u);
    if (s && s !== 'about:blank') w.location.assign(s);
  };
  const location = {
    assign: go,
    replace: go,
    get href() {
      return 'about:blank';
    },
    set href(u: string) {
      go(u);
    },
  };
  const noop = () => undefined;
  const standIn = {
    closed: false,
    opener: win,
    focus: noop,
    blur: noop,
    close: noop,
    postMessage: noop,
    document: { write: noop, writeln: noop, open: noop, close: noop },
    get location() {
      return location;
    },
    set location(u: unknown) {
      go(u);
    },
  };
  w.open = (u?: string | URL) => {
    if (u !== undefined) go(u);
    return standIn;
  };
}
