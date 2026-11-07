/**
 * Reads due dates written on platform pages ("Due: Nov 10, 2026 11:59 PM EST", "Due Date: 11/10/26 at 11:59pm"…)
 * and dates in syllabus rows. Pure text in, ISO strings out; no DOM.
 */

/** Strongest first. */
export type DueLabel = 'due' | 'deadline' | 'closes' | 'until';
export interface DueMatch {
  label: DueLabel;
  dueAt: string;
  /** The matched label and date, at most 120 characters. */
  text: string;
  /** Whether a time was written (else 11:59 PM was assumed). */
  hasTime: boolean;
}
export interface FoundDate {
  iso: string;
  /** Where the date (with its time and zone) starts and how long it is, in the searched text. */
  index: number;
  length: number;
  hasTime: boolean;
}
interface DateOpts {
  /** [hour, minute] used when no time is written. Default 23:59. */
  defaultTime?: [number, number];
}

/** US zone abbreviations, as hours from UTC. */
const ZONES: Record<string, number> = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, UTC: 0, GMT: 0 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const WD = String.raw`(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?`;
const MON = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?`;
interface Shape {
  re: RegExp;
  /** → [year | null, month 0-11, day] */
  read(m: RegExpExecArray): [number | null, number, number];
}
const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
const fullYear = (s: string | undefined) => (s === undefined ? null : s.length === 2 ? 2000 + Number(s) : Number(s));
const SHAPES: Shape[] = [
  // Nov 10 · Monday, Nov 9 · November 10, 2026 · Nov. 10th
  {
    re: new RegExp(String.raw`\b${WD}${MON}\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?`, 'gi'),
    read: (m) => [fullYear(m[3]), monthIndex(m[1]!), Number(m[2])],
  },
  // 11/10 · 11/10/26 · Mon 11/10/2026
  {
    re: new RegExp(String.raw`\b${WD}(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?\b`, 'gi'),
    read: (m) => [fullYear(m[3]), Number(m[1]) - 1, Number(m[2])],
  },
  // 2026-11-10
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, read: (m) => [Number(m[1]), Number(m[2]) - 1, Number(m[3])] },
  // 10-Nov
  {
    re: new RegExp(String.raw`\b(\d{1,2})-${MON}\b`, 'gi'),
    read: (m) => [null, monthIndex(m[2]!), Number(m[1])],
  },
];
const TIME_12 = /\s*,?\s*(?:at|@|by)?\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?/iy;
const TIME_24 = /(?:\s*,?\s*(?:at|@|by)?\s*|T)(\d{1,2}):(\d{2})\b(?!\s*[ap]\.?\s?m)/iy;
const ZONE = /\s*\(?([ECMP][SD]T|UTC|GMT)\)?/iy;

function valid(y: number, mo: number, d: number): boolean {
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return false;
  const t = new Date(y, mo, d);
  return t.getMonth() === mo && t.getDate() === d;
}

/** The first date (with optional time and zone) in `text`, or null. */
export function findDate(text: string, now: Date, opts: DateOpts = {}): FoundDate | null {
  let best: { m: RegExpExecArray; shape: Shape } | null = null;
  for (const shape of SHAPES) {
    shape.re.lastIndex = 0;
    for (let m = shape.re.exec(text); m; m = shape.re.exec(text)) {
      const [y, mo, d] = shape.read(m);
      if (!valid(y ?? 2024, mo, d)) continue; // 2024 is a leap year, so Feb 29 passes here and is checked per year below
      if (!best || m.index < best.m.index) best = { m, shape };
      break;
    }
  }
  if (!best) return null;
  const { m, shape } = best;
  const [year, month, day] = shape.read(m);
  let end = m.index + m[0].length;

  let hour = (opts.defaultTime ?? [23, 59])[0];
  let minute = (opts.defaultTime ?? [23, 59])[1];
  let hasTime = false;
  for (const re of [TIME_12, TIME_24]) {
    re.lastIndex = end;
    const t = re.exec(text);
    if (!t) continue;
    const h = Number(t[1]);
    const mi = Number(t[2] ?? 0);
    if (re === TIME_12) {
      if (h < 1 || h > 12) continue;
      hour = (h % 12) + (t[3]!.toLowerCase() === 'p' ? 12 : 0);
    } else {
      if (h > 23) continue;
      hour = h;
    }
    if (mi > 59) continue;
    minute = mi;
    hasTime = true;
    end = re.lastIndex;
    break;
  }
  let zone: number | undefined;
  if (hasTime) {
    ZONE.lastIndex = end;
    const z = ZONE.exec(text);
    if (z) {
      zone = ZONES[z[1]!.toUpperCase()];
      end = ZONE.lastIndex;
    }
  }

  const at = (y: number) =>
    zone === undefined ? new Date(y, month, day, hour, minute).getTime() : Date.UTC(y, month, day, hour, minute) - zone * 3_600_000;
  const years = (year !== null ? [year] : [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]).filter((y) => valid(y, month, day));
  if (years.length === 0) return null;
  const best_ = years.map(at).sort((a, b) => Math.abs(a - now.getTime()) - Math.abs(b - now.getTime()))[0]!;
  return { iso: new Date(best_).toISOString(), index: m.index, length: end - m.index, hasTime };
}

/** A date anywhere in `text`, as ISO; null when there is none. */
export function parseDateText(text: string, now: Date, opts: DateOpts = {}): string | null {
  return findDate(text, now, opts)?.iso ?? null;
}

const LABELS: [RegExp, DueLabel][] = [
  [/\bdue(?:\s+date)?(?:\s+on)?\b\s*:?/gi, 'due'],
  [/\bdeadline\b\s*:?/gi, 'deadline'],
  [/\bclose(?:s|\s+date)\b\s*:?/gi, 'closes'],
  [/\b(?:available|accepting|late)\s+until\b\s*:?/gi, 'until'],
];
/** The date must follow its label closely, without crossing a sentence or a table cell. */
const MAX_GAP = 40;
const BREAK = /[.|\n](?:\s|$)|\|/;

/** Every labeled date in a block of text, in reading order. */
export function findDueMatches(text: string, now: Date): DueMatch[] {
  const out: (DueMatch & { at: number })[] = [];
  for (const [re, label] of LABELS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const after = m.index + m[0].length;
      const window = text.slice(after, after + MAX_GAP + 60);
      const found = findDate(window, now);
      if (!found || found.index > MAX_GAP || BREAK.test(window.slice(0, found.index))) continue;
      const raw = text.slice(m.index, after + found.index + found.length).replace(/\s+/g, ' ').trim();
      out.push({ label, dueAt: found.iso, text: raw.length > 120 ? `${raw.slice(0, 119)}…` : raw, hasTime: found.hasTime, at: m.index });
    }
  }
  return out.sort((a, b) => a.at - b.at).map(({ at: _at, ...rest }) => rest);
}

/** The first "Due …" date in `text` (1.0 Wiley behavior). */
export function parseDueText(text: string, now: Date): string | null {
  return findDueMatches(text, now).find((m) => m.label === 'due')?.dueAt ?? null;
}

/**
 * The one due date a set of matches agrees on, or null when they name different days (a list) or different times on
 * one day. A date written once with its time and once without is the same date: the one with the time wins.
 */
export function agreedDue(matches: DueMatch[]): DueMatch | null {
  if (matches.length === 0) return null;
  const days = new Set(matches.map((m) => new Date(m.dueAt).toDateString()));
  if (days.size > 1) return null;
  const timed = matches.filter((m) => m.hasTime);
  if (new Set(timed.map((m) => m.dueAt)).size > 1) return null;
  return timed[0] ?? matches[0]!;
}
