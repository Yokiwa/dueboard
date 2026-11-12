import { runFinder, type FinderWindow } from '../finders/run';
import { isAckPost, type FrameConfig, type HelloPost, type ListedTitle, type ReaderMessage } from './protocol';

const CONFIG_POLL_MS = 250;
const CONFIG_GIVE_UP_MS = 5_000;
const ACK_GIVE_UP_MS = 20_000;

type ReaderWindow = FinderWindow & { __dueboardTitles?: ListedTitle[] };

export interface FrameReaderDeps {
  extensionOrigin: string;
  send(m: ReaderMessage): Promise<unknown>;
  openHereUrl: string;
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs in every frame of a page on a platform site. In a normal tab (the window is its own top) it does nothing. In a
 * nested frame it says hello to the top window, addressed to the extension origin only (so no website can receive it).
 * It sends nothing by runtime messaging and changes nothing until the top window answers with an ack carrying the same
 * nonce from the extension origin: only DueBoard's frame host does. Then it asks the background for its configuration and
 * runs the finder. The nonce is the only thing sent by postMessage; titles, dates and page text travel only by runtime
 * messaging.
 */
export function startFrameReader(win: Window, deps: FrameReaderDeps): void {
  if (win.top === win || !win.top) return;
  // Chrome lists the origins of all ancestors; the last one is the top page. A website there can't be the frame host.
  const ancestors = (win.location as { ancestorOrigins?: ArrayLike<string> }).ancestorOrigins;
  if (ancestors && ancestors.length > 0 && ancestors[ancestors.length - 1] !== deps.extensionOrigin) return;
  const top = win.top;
  const nonce = makeNonce();
  const hello: HelloPost = { dueboard: 'hello', nonce };

  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const onMessage = (e: MessageEvent) => {
    if (e.source !== top || e.origin !== deps.extensionOrigin || !isAckPost(e.data) || e.data.nonce !== nonce) return;
    win.removeEventListener('message', onMessage);
    clearTimeout(giveUp);
    ask();
  };
  win.addEventListener('message', onMessage);
  giveUp = setTimeout(() => win.removeEventListener('message', onMessage), ACK_GIVE_UP_MS);
  top.postMessage(hello, deps.extensionOrigin);

  const w = win as unknown as ReaderWindow;
  let started = 0;
  let taken = false;
  const ask = () => {
    if (!started) started = Date.now();
    void deps
      .send({ type: 'frameConfig', nonce })
      .then((answer) => {
        if (taken || !answer || typeof answer !== 'object') return;
        taken = true;
        begin(answer as FrameConfig);
      })
      .catch(() => undefined);
    if (Date.now() - started < CONFIG_GIVE_UP_MS) {
      setTimeout(() => {
        if (!taken) ask();
      }, CONFIG_POLL_MS);
    }
  };

  const begin = (config: FrameConfig) => {
    w.__dueboardMode = config.mode;
    if (config.platform) w.__dueboardPlatform = config.platform;
    w.__dueboardAllowOpen = config.allowOpen;
    w.__dueboardTitles = config.titles;
    w.__dueboardInFrame = true;
    if (config.allowOpen) addOpenHere(win.document, deps.openHereUrl);
    runFinder(w, (message) => void deps.send({ type: 'frameMessage', nonce, message }).catch(() => undefined));
  };

}

/** A page that would open the assignment in a new tab opens it in this frame instead (see open-here.ts). */
function addOpenHere(doc: Document, url: string): void {
  const parent = doc.head ?? doc.documentElement;
  if (!parent) return;
  const script = doc.createElement('script');
  script.src = url;
  script.addEventListener('load', () => script.remove());
  parent.appendChild(script);
}
