import type { FoundDue } from './finders/types';

/** Messages the injected finder script sends back to the background. */
export type VisitMessage =
  | { type: 'visitFound'; found: FoundDue | null; frameUrl: string; top: boolean }
  | { type: 'visitText'; lines: string[]; frameUrl: string };

/** The finder script WXT builds from src/entrypoints/visit-finder.ts. */
export const FINDER_FILE = '/visit-finder.js';

export function isVisitMessage(m: unknown): m is VisitMessage {
  const t = (m as { type?: unknown } | null)?.type;
  return t === 'visitFound' || t === 'visitText';
}
