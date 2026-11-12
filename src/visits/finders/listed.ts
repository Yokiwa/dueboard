import { agreedDue, findDueMatches, type DueMatch } from '../../core/dueText';
import type { Listed, ListedTitle } from '../frame/protocol';
import { compactBlocks, pageLines } from './lines';

const EVIDENCE_MAX = 120;

/** Lowercase runs of letters and digits ("HW11 (10.3)" -> hw11, 10, 3). */
const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** A title is matchable with at least 2 words or at least 4 characters ("HW11" yes, "Q1" no). */
const matchable = (w: string[]): boolean => w.length >= 2 || w.join('').length >= 4;

/** The title's words appear in the line in order and next to each other. */
function contains(line: string[], title: string[]): boolean {
  for (let i = 0; i + title.length <= line.length; i++) if (title.every((w, j) => line[i + j] === w)) return true;
  return false;
}

/**
 * A course page often lists several assignments with their dates. For each title, finds the row (or small block) that
 * names it and carries a "Due" date. A title found with two different dates, with no due date in its own row, or too
 * short to tell apart gets no entry. Only reads the page.
 */
export function findListed(doc: Document, titles: ListedTitle[], now: Date): Listed[] {
  const wanted = titles.map((t) => ({ ...t, words: words(t.title) })).filter((t) => matchable(t.words));
  if (wanted.length === 0) return [];
  const rows = [...pageLines(doc), ...compactBlocks(doc, 160, true)].map((text) => {
    const due = findDueMatches(text, now).filter((m) => m.label === 'due');
    return { text, words: words(text), pick: agreedDue(due) };
  });
  const out: Listed[] = [];
  for (const t of wanted) {
    const hits: { pick: DueMatch; text: string }[] = [];
    for (const r of rows) {
      if (!r.pick || !contains(r.words, t.words)) continue;
      // A block holding several listed titles can't say which date is whose.
      if (wanted.some((o) => o.key !== t.key && !contains(t.words, o.words) && contains(r.words, o.words))) continue;
      hits.push({ pick: r.pick, text: r.text });
    }
    const agreed = agreedDue(hits.map((h) => h.pick));
    if (!agreed) continue;
    const hit = hits.find((h) => h.pick === agreed) ?? hits[0]!;
    out.push({ key: t.key, found: { title: t.title, dueAt: agreed.dueAt, evidence: hit.text.slice(0, EVIDENCE_MAX).trim() } });
  }
  return out;
}
