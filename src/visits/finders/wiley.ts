import { agreedDue, findDueMatches, type DueMatch } from '../../core/dueText';
import { compactBlocks, pageLines, pageTitle } from './lines';
import type { FoundDue } from './types';

/**
 * WileyPLUS assignment pages: the heading is the assignment title and one text line reads
 * "Due Monday, Nov 9 at 11:59 PM (EST)".
 */
export function findDueWiley(doc: Document, now: Date): FoundDue | null {
  const title = pageTitle(doc);
  if (!title || !doc.body) return null;
  // Wiley renders labels, dates and times in separate elements. Read their visible blocks together.
  const matches: DueMatch[] = [...pageLines(doc), ...compactBlocks(doc)]
    .flatMap((text) => findDueMatches(text, now).filter((x) => x.label === 'due'));
  // Several assignments' dates on one page (the class page, not an assignment): no guess.
  const pick = agreedDue(matches);
  return pick ? { title, dueAt: pick.dueAt, evidence: pick.text } : null;
}
