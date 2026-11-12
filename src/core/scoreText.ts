/**
 * Reads the score of a finished piece of homework from platform page text ("1.5 / 25 points", "Score: 92%").
 * Pure text in, Score out; no DOM.
 */
import { agreedDue, findDueMatches, type DueMatch } from './dueText';
import type { Score } from './types';

/** Earned may exceed possible a little (extra credit), but not by more than this factor. */
const MAX_OVER = 1.5;
const NUM = String.raw`(\d+(?:\.\d+)?)`;
const LABEL_FRACTION = String.raw`\b(?:score|grade|points)\s*:?\s*`;
const LABEL_PERCENT = String.raw`\b(?:score|grade)\s*:?\s*`;
const NOT_DATE_BEFORE = String.raw`(?<![\d/.])`;
const NOT_DATE_AFTER = String.raw`(?!\s*/\s*\d)`;

const UNIT = String.raw`\s*(?:points?|pts?)\b`;
/** "18/20 pts", "1.5 / 25 points": a unit makes the fraction a score. */
const FRACTION_UNIT = new RegExp(String.raw`${NOT_DATE_BEFORE}${NUM}\s*/\s*${NUM}${NOT_DATE_AFTER}${UNIT}`, 'gi');
/**
 * A unit-form slot, filled or not ("18 / 25 points", "-- / 25 points", "- / 25 pts"). More than one in a frame means a
 * list of assignments (or of questions), so no score is read.
 */
const UNIT_SLOT = new RegExp(String.raw`${NOT_DATE_BEFORE}(?:${NUM}|[-\u2013\u2014]+)\s*/\s*${NUM}${UNIT}`, 'gi');
/** "Question 3 of 10": the page shows one question of many, so any points on it are that question's. */
const QUESTION_PROGRESS = /\b(?:question|problem)\s+\d+\s+of\s+\d+\b/i;
/** A date label before a fraction on its line ("Due 11/20 Points: 10"): the fraction is the date. */
const DATE_BEFORE = /\b(?:due|date)\b/i;
/** A fraction counting progress or tries, not points earned ("3/10 questions", "2/3 attempts", "Progress: 3/10"). */
const PROGRESS_WORDS = String.raw`(?:progress|complete|completed|attempts?|questions?|answered|tries)`;
const PROGRESS_AFTER = new RegExp(String.raw`^\s*${PROGRESS_WORDS}\b`, 'i');
const PROGRESS_BEFORE = new RegExp(String.raw`\b${PROGRESS_WORDS}\s*:?\s*$`, 'i');
/** A percentage of work done ("100% complete"), not a score. */
const DONE_AFTER = /^\s*(?:complete|completed|progress)\b/i;
/** "18 of 20 points earned". */
const FRACTION_EARNED = new RegExp(String.raw`${NOT_DATE_BEFORE}${NUM}\s+of\s+${NUM}\s*(?:points?|pts?)\s+earned\b`, 'gi');
/** "Score: 18 / 20", "Grade 9.5/10": a label makes the fraction a score. */
const FRACTION_LABELED = new RegExp(String.raw`${LABEL_FRACTION}${NOT_DATE_BEFORE}${NUM}\s*/\s*${NUM}\b${NOT_DATE_AFTER}`, 'gi');
/** "Score: 92%", "Grade 87.5 %". */
const PERCENT_LABELED = new RegExp(String.raw`${LABEL_PERCENT}${NOT_DATE_BEFORE}${NUM}\s*%`, 'gi');
/** A percentage followed by these words is a penalty, not a score. */
const PENALTY_AFTER = /^\s*(?:\S+\s+){0,3}?(?:reduction|penalty|late|off)\b/i;
/** A threshold written after a percentage ("70% required to pass"). */
const THRESHOLD_AFTER = /^\s*(?:required|or higher|to pass|needed)\b/i;
/** A label qualified by one of these words names a threshold, an average or a maximum, not the student's score. */
const QUALIFIED_BEFORE = /\b(?:passing|minimum|min|average|avg|class|required|target|max|maximum|possible)\s*(?:score|grade|points)?\s*:?\s*$/i;

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
  for (const re of [FRACTION_UNIT, FRACTION_EARNED, FRACTION_LABELED]) {
    for (const m of matches(re, line)) {
      const before = line.slice(0, m.index);
      const after = line.slice(m.index + m[0].length);
      if (QUALIFIED_BEFORE.test(before) || PROGRESS_BEFORE.test(before) || PROGRESS_AFTER.test(after)) continue;
      if (re !== FRACTION_LABELED && DATE_BEFORE.test(before)) continue;
      const earned = Number(m[1]);
      const possible = Number(m[2]);
      if (!(possible > 0) || earned > possible * MAX_OVER) continue;
      out.push({ text: formatPoints(earned, possible), earned, possible, line });
    }
  }
  for (const m of matches(PERCENT_LABELED, line)) {
    const pct = Number(m[1]);
    if (pct > 100 * MAX_OVER || QUALIFIED_BEFORE.test(line.slice(0, m.index))) continue;
    const after = line.slice(m.index + m[0].length);
    if (PENALTY_AFTER.test(after) || THRESHOLD_AFTER.test(after) || DONE_AFTER.test(after)) continue;
    out.push({ text: `${Number(pct.toFixed(2))}%`, line });
  }
  return out;
}

/** Unit-form slots on the lines, leaving out ones labeled as someone else's number ("Class average: 15 / 25 points"). */
function unitSlots(lines: string[]): number {
  let n = 0;
  for (const line of lines) {
    for (const m of matches(UNIT_SLOT, line)) if (!QUALIFIED_BEFORE.test(line.slice(0, m.index))) n++;
  }
  return n;
}

/** Whether the lines show due dates that disagree under one label: a list of assignments, not one. */
function duesDisagree(lines: string[], now: Date): boolean {
  const byLabel = new Map<string, DueMatch[]>();
  for (const m of lines.flatMap((line) => findDueMatches(line, now))) byLabel.set(m.label, [...(byLabel.get(m.label) ?? []), m]);
  return [...byLabel.values()].some((ms) => agreedDue(ms) === null);
}

/**
 * The one score the lines agree on, or null when there is none or they name different scores (a class average, a list).
 * The same score written twice is one score. A frame that looks like a list (more than one "x / N points" slot, due dates
 * that disagree) or shows one question of many ("Question 3 of 10") gives no score.
 */
export function findScore(lines: string[], from: string, now: Date = new Date()): Score | null {
  if (lines.some((l) => QUESTION_PROGRESS.test(l)) || unitSlots(lines) > 1 || duesDisagree(lines, now)) return null;
  const found = lines.flatMap(candidates);
  const first = found[0];
  if (!first || new Set(found.map((c) => c.text)).size > 1) return null;
  const score: Score = { text: first.text, from, evidence: first.line.trim().slice(0, 120) };
  if (first.earned !== undefined) score.earned = first.earned;
  if (first.possible !== undefined) score.possible = first.possible;
  return score;
}
