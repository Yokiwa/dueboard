import { normalizeTitle } from '../core/courseCode';
import { findDate } from '../core/dueText';

import type { SyllabusRow } from '../core/types';

export type { SyllabusRow };
export interface Term {
  start: Date;
  end: Date;
}

const WORK = /\b(hw\d*|homework|assignments?|quiz(?:zes)?|exams?|midterms?|finals?|projects?|labs?|essays?|papers?|reports?|presentations?|due)\b/i;
const EXAM = /\b(exams?|midterms?|finals?)\b/i;
const WEEK = /^(week|wk)\s*\d+$/i;
const DAY = 86_400_000;

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s|,;:–—-]+|[\s|,;:–—-]+$/g, '').trim();
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Dated work in a syllabus, one row per line (table rows arrive as "cell | cell | cell"). A row needs a calendar date
 * and a word for graded work; the year is the one inside the term, and rows outside the term are dropped. Times are
 * kept as written; otherwise work is due 11:59 PM and exams are all-day.
 */
export function extractSyllabusRows(lines: string[], term: Term, _now: Date): SyllabusRow[] {
  const mid = new Date((term.start.getTime() + term.end.getTime()) / 2);
  const out: SyllabusRow[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || !WORK.test(line)) continue;
    const exam = EXAM.test(line);
    const date = findDate(line, mid, { defaultTime: exam ? [0, 0] : [23, 59] });
    if (!date) continue;
    const at = Date.parse(date.iso);
    if (at < term.start.getTime() || at > term.end.getTime() + DAY) continue;

    const rest = line.slice(0, date.index) + line.slice(date.index + date.length);
    const cells = rest.split('|').map(clean).filter((c) => c && !WEEK.test(c));
    const work = cells.filter((c) => WORK.test(c));
    const title = short(clean((work.length ? work : cells).join(' · ')), 80);
    if (!title) continue;

    const key = `${normalizeTitle(title)}|${date.iso.slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, dueAt: date.iso, allDay: exam && !date.hasTime, excerpt: short(line, 120) });
  }
  return out;
}
