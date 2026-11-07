import { agreedDue, findDueMatches, type DueMatch } from '../../core/dueText';
import type { FoundDue } from './types';

/**
 * WileyPLUS assignment pages: the heading is the assignment title and one text line reads
 * "Due Monday, Nov 9 at 11:59 PM (EST)".
 */
export function findDueWiley(doc: Document, now: Date): FoundDue | null {
  const title = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  if (!title || !doc.body) return null;
  const matches: DueMatch[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) matches.push(...findDueMatches(n.textContent ?? '', now).filter((x) => x.label === 'due'));
  // Several assignments' dates on one page (the class page, not an assignment): no guess.
  const pick = agreedDue(matches);
  return pick ? { title, dueAt: pick.dueAt, evidence: pick.text } : null;
}
