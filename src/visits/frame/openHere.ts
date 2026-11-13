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
export function installOpenHere(win: Window = window, routeToTop = false): void {
  const w = win as unknown as OpenWindow;
  if (w.__dueboardOpenHere) return;
  w.__dueboardOpenHere = true;
  const go = (u: unknown) => {
    const s = String(u);
    if (s && s !== 'about:blank') {
      if (routeToTop && win.top) win.top.location.assign(s);
      else w.location.assign(s);
    }
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
  w.open = (u?: string | URL, target?: string) => {
    if ((!u || String(u) === 'about:blank') && doc?.createElement) {
      // A real child browsing context supports document.write + POST forms, opener and postMessage.
      // The ancestor sandbox continues to forbid actual tabs/windows and top-level navigation.
      const frame = doc.createElement('iframe');
      frame.name = target && !target.startsWith('_') ? target : `dueboard-popup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      frame.width = '1280';
      frame.height = '900';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:1280px;height:900px;border:0';
      const existingTopTab = win.top === win;
      frame.setAttribute('sandbox', `allow-scripts allow-same-origin allow-forms${existingTopTab ? ' allow-top-navigation' : ''}`);
      (doc.body ?? doc.documentElement).appendChild(frame);
      const child = frame.contentWindow;
      if (child) {
        try { child.opener = win; } catch { /* Some browsers make opener read-only. */ }
        installOpenHere(child, existingTopTab);
        if (existingTopTab) {
          // In the first-connection tab, keep top-level cookies and avoid embedding restrictions.
          // Blank popup forms submit to this same tab; location assignments use the existing proxy.
          return Object.create(standIn, {
            document: { value: child.document },
            postMessage: { value: child.postMessage.bind(child) },
          });
        }
        return child;
      }
      frame.remove();
    }
    if (u !== undefined) go(u);
    return standIn;
  };

  // Forms and links meant for another window (a new tab, the top page, a named window) are sent here too. Brightspace's
  // launch page for a tool set to "open in a new window" posts its form to a new window. A target naming a frame of the
  // page itself is left alone.
  const doc = (win as unknown as { document?: Document }).document;
  const keepHere = (el: Element | null) => {
    if (routeToTop && el?.tagName.toLowerCase() === 'form') { el.setAttribute('target', '_top'); return; }
    const target = el?.getAttribute('target')?.trim();
    if (!el || !target || target === '_self') return;
    const ownFrame = !target.startsWith('_') && Array.from(doc?.querySelectorAll('iframe, frame') ?? []).some((f) => (f as HTMLIFrameElement).name === target);
    if (!ownFrame) el.setAttribute('target', '_self');
  };
  const Form = (win as unknown as { HTMLFormElement?: { prototype: { submit?: () => void; requestSubmit?: (s?: unknown) => void } } }).HTMLFormElement;
  if (Form) {
    const submit = Form.prototype.submit;
    const requestSubmit = Form.prototype.requestSubmit;
    if (submit)
      Form.prototype.submit = function (this: Element) {
        keepHere(this);
        return submit.call(this);
      };
    if (requestSubmit)
      Form.prototype.requestSubmit = function (this: Element, submitter?: unknown) {
        keepHere(this);
        return requestSubmit.call(this, submitter);
      };
  }
  // A link clicked from a script: often one the page never added to the document (its click reaches no listener), or one
  // inside a web component. The click itself is caught, as a call and as a sent event.
  const linkOf = (el: unknown): Element | null => {
    const e = el as { closest?: (s: string) => Element | null } | null;
    return e && typeof e.closest === 'function' ? e.closest('a[target], area[target]') : null;
  };
  const Anchor = (win as unknown as { HTMLAnchorElement?: { prototype: { click?: () => void } } }).HTMLAnchorElement;
  const click = Anchor?.prototype.click;
  if (Anchor && click)
    Anchor.prototype.click = function (this: Element) {
      keepHere(this);
      return click.call(this);
    };
  const Target = (win as unknown as { EventTarget?: { prototype: { dispatchEvent?: (e: Event) => boolean } } }).EventTarget;
  const dispatch = Target?.prototype.dispatchEvent;
  if (Target && dispatch)
    Target.prototype.dispatchEvent = function (this: unknown, e: Event) {
      if (e && e.type === 'click') keepHere(linkOf(this));
      return dispatch.call(this, e);
    };
  if (doc) {
    const first = (e: Event) => (typeof e.composedPath === 'function' ? e.composedPath()[0] : e.target);
    doc.addEventListener('submit', (e) => keepHere(first(e) as Element), true);
    doc.addEventListener('click', (e) => keepHere(linkOf(first(e))), true);
  }
}
