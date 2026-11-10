/**
 * Reads the score of a finished piece of homework from platform page text ("1.5 / 25 points", "Score: 92%").
 * Pure text in, Score out; no DOM.
 */
import type { Score } from './types';

/** Earned may exceed possible a little (extra credit), but not by more than this factor. */
const MAX_OVER = 1.5;
const NUM = String.raw`(\d+(?:\.\d+)?)`;
const LABEL = String.raw`\b(?:score|grade|points|result|mark)s?\s*:?\s*`;
const NOT_DATE_BEFORE = String.raw`(?<![\d/.])`;
const NOT_DATE_AFTER = String.raw`(?!\s*/\s*\d)`;

/** "18/20 pts", "1.5 / 25 points", "18 of 20 points earned": a unit makes the fraction a score. */
const FRACTION_UNIT = new RegExp(String.raw`${NOT_DATE_BEFORE}${NUM}\s*(?:/|of)\s*${NUM}\s*(?:points?|pts?)\b`, 'gi');
/** "Score: 18 / 20", "Grade 9.5/10": a label makes the fraction a score. */
const FRACTION_LABELED = new RegExp(String.raw`${LABEL}${NOT_DATE_BEFORE}${NUM}\s*/\s*${NUM}\b${NOT_DATE_AFTER}`, 'gi');
/** "Score: 92%", "Grade 87.5 %". */
const PERCENT_LABELED = new RegExp(String.raw`${LABEL}${NOT_DATE_BEFORE}${NUM}\s*%`, 'gi');
/** A percentage followed by these words is a penalty, not a score. */
const PENALTY_AFTER = /^\s*(?:\S+\s+){0,3}?(?:reduction|penalty|late|off)\b/i;

/** "18/20" and "1.5/25". */
export function formatPoints(earned: number, possible: number): string {
  const n = (v: number) => String(Number(v.toFixed(2)));
  return `${n(earned)}/${n(possible)}`;
}

interface Candidate {
  text: string;
  earned?: number;
  possible?: number;
  line: string;
}

function* matches(re: RegExp, line: string): Generator<RegExpExecArray> {
  re.lastIndex = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) yield m;
}

function candidates(line: string): Candidate[] {
  const out: Candidate[] = [];
  for (const re of [FRACTION_UNIT, FRACTION_LABELED]) {
    for (const m of matches(re, line)) {
      const earned = Number(m[1]);
      const possible = Number(m[2]);
      if (!(possible > 0) || earned > possible * MAX_OVER) continue;
      out.push({ text: formatPoints(earned, possible), earned, possible, line });
    }
  }
  for (const m of matches(PERCENT_LABELED, line)) {
    const pct = Number(m[1]);
    if (pct > 100 * MAX_OVER) continue;
    if (PENALTY_AFTER.test(line.slice(m.index + m[0].length))) continue;
    out.push({ text: `${Number(pct.toFixed(2))}%`, line });
  }
  return out;
}

/**
 * The one score the lines agree on, or null when there is none or they name different scores (a class average, a list).
 * The same score written twice is one score.
 */
export function findScore(lines: string[], from: string): Score | null {
  const found = lines.flatMap(candidates);
  const first = found[0];
  if (!first || new Set(found.map((c) => c.text)).size > 1) return null;
  const score: Score = { text: first.text, from, evidence: first.line.trim().slice(0, 120) };
  if (first.earned !== undefined) score.earned = first.earned;
  if (first.possible !== undefined) score.possible = first.possible;
  return score;
}
