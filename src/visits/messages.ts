import type { FoundDue } from './finders/types';

/** Messages the injected finder script sends back to the background. */
export type VisitMessage =
  /** A frame of the visited page loaded and started reading (for the visit log). */
  | { type: 'visitFrame'; frameUrl: string; top: boolean }
  | { type: 'visitFound'; found: FoundDue | null; frameUrl: string; top: boolean }
  | { type: 'visitText'; lines: string[]; frameUrl: string };

/** The finder script WXT builds from src/entrypoints/visit-finder.ts. */
export const FINDER_FILE = '/visit-finder.js';

export function isVisitMessage(m: unknown): m is VisitMessage {
  const t = (m as { type?: unknown } | null)?.type;
  return t === 'visitFound' || t === 'visitText' || t === 'visitFrame';
}

/** An address without its query and fragment (launch tokens and the like stay out of logs). */
export function stripUrl(url: string): string {
  return url.replace(/[?#].*$/, '');
}
