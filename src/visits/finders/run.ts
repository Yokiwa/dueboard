import type { VisitMessage } from '../messages';
import { findDue, pageLines } from './index';

export interface FinderWindow {
  document: Document;
  location: { href: string };
  top: unknown;
  /** Set by the visit runner before the finder script is injected. */
  __dueboardMode?: 'due' | 'syllabus';
  __dueboardPlatform?: string;
}

/**
 * Runs in every frame of a visited page. Platforms are mostly single-page apps that render late, so the page is
 * polled. Due mode: report a date as soon as one is found; at the time limit only the top frame reports "nothing".
 * Syllabus mode: once the text has stopped changing, send the page as lines (top frame, or a frame with real content).
 * Sends at most one message per frame. Only reads the page.
 */
export function runFinder(win: FinderWindow, send: (m: VisitMessage) => void, opts: { pollMs?: number; maxMs?: number; settleMs?: number } = {}): void {
  const pollMs = opts.pollMs ?? 500;
  const maxMs = opts.maxMs ?? 10_000;
  const settleMs = opts.settleMs ?? 1_500;
  const top = win.top === win;
  const frameUrl = win.location.href;
  const started = Date.now();
  let lastText = '';
  let stableSince = started;

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
        send({ type: 'visitFound', found, frameUrl, top });
        return;
      }
      if (elapsed >= maxMs) {
        if (top) send({ type: 'visitFound', found: null, frameUrl, top });
        return;
      }
    }
    setTimeout(tick, pollMs);
  };
  tick();
}
