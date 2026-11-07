import { findDueMatches } from '../../core/dueText';
import type { FoundDue } from './types';

/**
 * WileyPLUS assignment pages: the heading is the assignment title and one text line reads
 * "Due Monday, Nov 9 at 11:59 PM (EST)".
 */
export function findDueWiley(doc: Document, now: Date): FoundDue | null {
  const title = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  if (!title || !doc.body) return null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = findDueMatches(n.textContent ?? '', now).find((x) => x.label === 'due');
    if (m) return { title, dueAt: m.dueAt, evidence: m.text };
  }
  return null;
}
