import { extractCourseCode } from './courseCode';

const TERM = /\b(fall|spring|summer|winter)\s+\d{4}\b/gi;
const CODE_TOKEN = /\b[A-Za-z]{2,5}\s?\d{3,5}(?:-[A-Za-z0-9]+)?\b/g;
// Section / format markers Purdue appends to offering names. Upper-case only, so a real title like "Chemistry Lab" survives.
const MARKERS = /\b(LEC|LAB|REC|SEM|PSO|LBR|DIS|IND|STU|CLN|EXP)\b|\bmerged?\b/gi;
const EDGE = /^[\s\-–—:·|,/]+|[\s\-–—:·|,/]+$/g;

/**
 * The human part of a course name, without term, course code, section and "Merge" markers.
 * "Fall 2026 CHM 11510 - Merge" → "" (the card then shows just the code);
 * "Spring 2027 MA 26100 Multivariate Calculus - LEC" → "Multivariate Calculus".
 */
export function displayName(course: { name: string; code: string }): string {
  if (course.name.trim() === course.code.trim()) return '';
  const cleaned = course.name
    .replace(TERM, ' ')
    .replace(CODE_TOKEN, (token) => (extractCourseCode(token.replace(/-[A-Za-z0-9]+$/, '')) === course.code ? ' ' : token))
    .replace(MARKERS, (m) => (/^merged?$/i.test(m) || m === m.toUpperCase() ? ' ' : m))
    .replace(/\b\d{3}\b/g, ' ') // section numbers like "331 332 333"
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(EDGE, '')
    .trim();
  return /\p{L}/u.test(cleaned) ? cleaned.replace(/^[\s,;/]+|[\s,;/]+$/g, '').replace(/\s*,(\s*,)+\s*/g, ' ') : '';
}
