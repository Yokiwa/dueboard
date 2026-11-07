import { findDueMatches, type DueLabel, type DueMatch } from '../../core/dueText';
import { compactBlocks, pageLines, pageTitle } from './lines';
import type { FoundDue } from './types';

const STRENGTH: DueLabel[] = ['due', 'deadline', 'closes', 'until'];

/**
 * Works on any platform's assignment page: finds "Due …" (or Deadline / Closes / Available until) followed by a date.
 * Uses the strongest label present; if that label carries different dates the page is a list, so nothing is returned
 * rather than a guess.
 */
export function findDueUniversal(doc: Document, now: Date): FoundDue | null {
  const matches: DueMatch[] = [...pageLines(doc), ...compactBlocks(doc)].flatMap((line) => findDueMatches(line, now));
  for (const label of STRENGTH) {
    const these = matches.filter((m) => m.label === label);
    if (these.length === 0) continue;
    if (new Set(these.map((m) => m.dueAt)).size > 1) return null;
    return { title: pageTitle(doc), dueAt: these[0]!.dueAt, evidence: these[0]!.text };
  }
  return null;
}
