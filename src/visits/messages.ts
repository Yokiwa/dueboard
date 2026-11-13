import type { CheckAnswer } from '../core/types';
import type { FoundDue } from './finders/types';
import type { Listed } from './frame/protocol';

/** Messages the injected finder script sends back to the background. */
export type VisitMessage =
  /** A frame of the visited page loaded and started reading (for the visit log). */
  | { type: 'visitFrame'; frameUrl: string; top: boolean }
  /** What a frame showed when it found no date: a short text sample and its buttons (for the visit log). */
  | { type: 'visitSample'; frameUrl: string; text: string; buttons: string[] }
  /** The frame pressed its "open the assignment" button (for the visit log). */
  | { type: 'visitClick'; label: string; frameUrl: string }
  /** A date (or, at the time limit, null); `check` when the page also shows whether the work is done. */
  | { type: 'visitFound'; found: FoundDue | null; frameUrl: string; top: boolean; check?: CheckAnswer }
  /** Check mode: whether the page shows the work done, or (at the time limit) null. */
  | { type: 'visitCheck'; check: CheckAnswer | null; frameUrl: string; top: boolean }
  /** A rendered Pearson assignments table, transient and never included in diagnostics. */
  | { type: 'visitSessionReady'; html: string; frameUrl: string }
  | { type: 'visitText'; lines: string[]; frameUrl: string }
  /** Every listed assignment date the page showed (frame reader only; the visit window ignores it, so it is not in isVisitMessage). */
  | { type: 'visitListed'; listed: Listed[] };

/** The finder script WXT builds from src/entrypoints/visit-finder.ts. */
export const FINDER_FILE = '/visit-finder.js';

export function isVisitMessage(m: unknown): m is VisitMessage {
  const t = (m as { type?: unknown } | null)?.type;
  return t === 'visitFound' || t === 'visitCheck' || t === 'visitSessionReady' || t === 'visitText' || t === 'visitFrame' || t === 'visitClick' || t === 'visitSample';
}

/** An address without its query and fragment (launch tokens and the like stay out of logs). */
export function stripUrl(url: string): string {
  return url.replace(/[?#].*$/, '');
}
