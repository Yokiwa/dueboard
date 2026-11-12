import { stripUrl, type VisitMessage } from '../messages';
import type { ListedTitle } from '../frame/protocol';
import { findDue, pageLines } from './index';
import { findListed } from './listed';
import { buttonLabels, openButton, sessionStep } from './open';

export interface FinderWindow {
  document: Document;
  location: { href: string };
  top: unknown;
  /** Set by the visit runner before the finder script is injected. */
  __dueboardMode?: 'due' | 'syllabus' | 'session';
  __dueboardPlatform?: string;
  /** Set while this frame is reading, so repeated injections (for late frames) don't start a second reader. */
  __dueboardReading?: boolean;
  /** Set by the runner for homework visits: the reader may press "open the assignment" (see open.ts). */
  __dueboardAllowOpen?: boolean;
  /** Set by the frame reader for homework visits: titles whose dates may be listed on this page (see listed.ts). */
  __dueboardTitles?: ListedTitle[];
  /** Set by the frame reader: this frame is in DueBoard's hidden frames, which have no top page of their own. */
  __dueboardInFrame?: boolean;
}

const BRIGHTSPACE_HOST = 'purdue.brightspace.com';
/** How long a platform page gets to show its date before its "open the assignment" button is pressed. */
const OPEN_AFTER_MS = 4_000;
/** How long a sign-in visit's page gets to show the link to its next step (Pearson's portal loads slowly). */
const SESSION_STEP_MS = 35_000;

/**
 * Runs in every frame of a visited page. Platforms are mostly single-page apps that render late, so the page is
 * polled. Due mode: report a date as soon as one is found; at the time limit only the top frame reports "nothing".
 * Syllabus mode: once the text has stopped changing, send the page as lines (top frame, or a frame with real content).
 * Sends at most one message per frame. Only reads the page.
 */
export function runFinder(win: FinderWindow, send: (m: VisitMessage) => void, opts: { pollMs?: number; maxMs?: number; settleMs?: number } = {}): void {
  if (win.__dueboardReading) return;
  win.__dueboardReading = true;
  const pollMs = opts.pollMs ?? 500;
  const maxMs = opts.maxMs ?? 10_000;
  const settleMs = opts.settleMs ?? 1_500;
  const top = win.top === win;
  const frameUrl = win.location.href;
  const started = Date.now();
  send({ type: 'visitFrame', frameUrl: stripUrl(frameUrl), top });
  // A session visit only needs to know the page loaded, unless the platform needs one more step to sign in (Pearson's
  // Assignments link): that link is pressed once, as soon as the page shows it.
  if (win.__dueboardMode === 'session') {
    const step = () => {
      const link = sessionStep(win.document, win.__dueboardPlatform, hostOf(frameUrl));
      if (link) {
        send({ type: 'visitClick', label: link.label, frameUrl: stripUrl(frameUrl) });
        link.press();
        return;
      }
      if (Date.now() - started < Math.max(maxMs, SESSION_STEP_MS)) {
        setTimeout(step, pollMs);
        return;
      }
      // Not found: describe the page for the visit log, so a stuck sign-in can be seen and fixed.
      if (hostOf(frameUrl) !== BRIGHTSPACE_HOST) {
        const text = pageLines(win.document).join(' / ').replace(/\s+/g, ' ').slice(0, 300);
        send({ type: 'visitSample', frameUrl: stripUrl(frameUrl), text, buttons: buttonLabels(win.document) });
      }
    };
    step();
    return;
  }
  let lastText = '';
  let pressed = false;
  let stableSince = started;
  // Once per frame, just before its final message: every listed title this page dates (never on Brightspace pages).
  const titles = win.__dueboardTitles;
  const sendListed = () => {
    if (!titles?.length || hostOf(frameUrl) === BRIGHTSPACE_HOST) return;
    const listed = findListed(win.document, titles, new Date());
    if (listed.length > 0) send({ type: 'visitListed', listed });
  };

  const tick = () => {
    const elapsed = Date.now() - started;
    if (win.__dueboardMode === 'syllabus') {
      const lines = pageLines(win.document);
      const text = lines.join('\n');
      if (text !== lastText) {
        lastText = text;
        stableSince = Date.now();
      }
      const settled = Date.now() - stableSince >= settleMs && text.length > 0;
      if (settled || elapsed >= maxMs) {
        if (top || lines.length > 20) send({ type: 'visitText', lines, frameUrl });
        return;
      }
    } else {
      const found = findDue(win.document, new Date(), win.__dueboardPlatform);
      if (found) {
        sendListed();
        send({ type: 'visitFound', found, frameUrl, top });
        return;
      }
      // A launcher page that waits for a click: press its "open the assignment" button, once, on platform pages only.
      if (win.__dueboardAllowOpen && !pressed && elapsed >= OPEN_AFTER_MS && hostOf(frameUrl) !== BRIGHTSPACE_HOST) {
        const button = openButton(win.document);
        if (button) {
          pressed = true;
          send({ type: 'visitClick', label: button.label, frameUrl: stripUrl(frameUrl) });
          button.press();
        }
      }
      if (elapsed >= maxMs) {
        // Nothing found here: describe the page for the visit log, so a stuck step can be seen and fixed.
        sendListed();
        const text = pageLines(win.document).join(' / ').replace(/\s+/g, ' ').slice(0, 300);
        send({ type: 'visitSample', frameUrl: stripUrl(frameUrl), text, buttons: buttonLabels(win.document) });
        // The top page says "nothing here"; in DueBoard's hidden frames (no top page of their own) every frame does, and
        // the frame host listens to the one the visit landed on.
        if (top || win.__dueboardInFrame) send({ type: 'visitFound', found: null, frameUrl, top });
        return;
      }
    }
    setTimeout(tick, pollMs);
  };
  tick();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
