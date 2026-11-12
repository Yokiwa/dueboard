import { agreedDue, findDueMatches, type DueMatch } from '../../core/dueText';
import type { Listed, ListedTitle } from '../frame/protocol';
import { compactBlocks, pageLines } from './lines';

const EVIDENCE_MAX = 120;

/** Lowercase runs of letters and digits ("HW11 (10.3)" -> hw11, 10, 3). */
const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** The title's words appear in the line in order and next to each other. */
function contains(line: string[], title: string[]): boolean {
  for (let i = 0; i + title.length <= line.length; i++) if (title.every((w, j) => line[i + j] === w)) return true;
  return false;
}

/** A title is matchable with at least 2 words or at least 4 characters ("HW11" yes, "Q1" no). */
const matchable = (w: string[]): boolean => w.length >= 2 || w.join('').length >= 4;

const ALNUM = '[\\p{L}\\p{N}]';
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The title's words, next to each other and whole, as a sticky pattern. */
const titlePattern = (w: string[]) => new RegExp(`(?<!${ALNUM})${w.map(escape).join(`[^\\p{L}\\p{N}]+`)}(?!${ALNUM})`, 'iuy');
const NUMBERING = /^\s*(?:\d+[.)]\s+|[-*•·▪◦–—]+\s*)/;
/** Words that may follow a title before its date. */
const FILLER = new Set(['due', 'pts', 'points']);

/**
 * Where a title starts its line or cell (after optional numbering or a bullet), and what follows it: the end of the
 * match, or null when the row doesn't start with the title.
 */
function titleSpan(text: string, pattern: RegExp): { start: number; end: number } | null {
  const starts = [0];
  const num = NUMBERING.exec(text);
  if (num) starts.push(num[0].length);
  for (const m of text.matchAll(/ \| /g)) starts.push(m.index! + m[0].length);
  for (const at of starts) {
    pattern.lastIndex = at;
    const m = pattern.exec(text);
    if (m) return { start: at, end: at + m[0].length };
  }
  return null;
}

/** The text after a title, up to the next separator or the date's label, holds no word but due / pts / points. */
function plainAfter(rest: string): boolean {
  const segment = rest.split(/[|,;:(]/)[0]!;
  for (const w of segment.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (w === 'due') return true;
    if (/^\p{L}+$/u.test(w) && !FILLER.has(w)) return false;
  }
  return true;
}

/** Words between the title's end and the date's label. */
function gapWords(rest: string): number {
  const label = /\bdue\b/i.exec(rest);
  return label ? words(rest.slice(0, label.index)).length : Infinity;
}

/**
 * A course page often lists several assignments with their dates. For each title, finds the row (or small block) that
 * starts with it and carries a "Due" date. A title found with two different dates, with no due date in its own row, or
 * too short to tell apart gets no entry; neither does a title that is only the start of a longer name ("HW 5 extra
 * credit"). Only reads the page.
 */
export function findListed(doc: Document, titles: ListedTitle[], now: Date): Listed[] {
  const wanted = titles.map((t) => ({ ...t, words: words(t.title) })).filter((t) => matchable(t.words));
  if (wanted.length === 0) return [];
  const toRow = (block: boolean) => (text: string) => ({ text, block, words: words(text) });
  /** The date of the text from a title's start to the row's end: an earlier cell's date is not this title's. */
  const dueFrom = (text: string) => agreedDue(findDueMatches(text, now).filter((m) => m.label === 'due'));
  const rows = [...pageLines(doc).map(toRow(false)), ...compactBlocks(doc, 160, true).map(toRow(true))];
  const out: Listed[] = [];
  for (const t of wanted) {
    const pattern = titlePattern(t.words);
    const hits: { pick: DueMatch; text: string }[] = [];
    for (const r of rows) {
      if (!contains(r.words, t.words)) continue;
      const span = titleSpan(r.text, pattern);
      if (!span) continue;
      const rest = r.text.slice(span.end);
      if (!plainAfter(rest) || (r.block && gapWords(rest) > 4)) continue;
      // A block holding several listed titles can't say which date is whose.
      if (wanted.some((o) => o.key !== t.key && !contains(t.words, o.words) && contains(r.words, o.words))) continue;
      const pick = dueFrom(r.text.slice(span.start));
      if (pick) hits.push({ pick, text: r.text });
    }
    const agreed = agreedDue(hits.map((h) => h.pick));
    if (!agreed) continue;
    const hit = hits.find((h) => h.pick === agreed) ?? hits[0]!;
    out.push({ key: t.key, found: { title: t.title, dueAt: agreed.dueAt, evidence: hit.text.slice(0, EVIDENCE_MAX).trim() } });
  }
  return out;
}
