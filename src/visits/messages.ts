import type { Score } from '../core/types';
import type { FoundDue } from './finders/types';

/** Messages the injected finder script sends back to the background. */
export type VisitMessage =
  /** A frame of the visited page loaded and started reading (for the visit log). */
  | { type: 'visitFrame'; frameUrl: string; top: boolean }
  /** What a frame showed when it found no date: a short text sample and its buttons (for the visit log). */
  | { type: 'visitSample'; frameUrl: string; text: string; buttons: string[] }
  /** The frame pressed its "open the assignment" button (for the visit log). */
  | { type: 'visitClick'; label: string; frameUrl: string }
  | { type: 'visitFound'; found: FoundDue | null; frameUrl: string; top: boolean }
  /** Score mode: the score a frame read (null at the time limit, from the top frame). */
  | { type: 'visitScore'; score: Score | null; frameUrl: string; top: boolean }
  | { type: 'visitText'; lines: string[]; frameUrl: string };

/** The finder script WXT builds from src/entrypoints/visit-finder.ts. */
export const FINDER_FILE = '/visit-finder.js';

export function isVisitMessage(m: unknown): m is VisitMessage {
  const t = (m as { type?: unknown } | null)?.type;
  return t === 'visitFound' || t === 'visitScore' || t === 'visitText' || t === 'visitFrame' || t === 'visitClick' || t === 'visitSample';
}

/** An address without its query and fragment (launch tokens and the like stay out of logs). */
export function stripUrl(url: string): string {
  return url.replace(/[?#].*$/, '');
}
