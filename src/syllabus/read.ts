import type { CourseSyllabus, SyllabusSource } from '../core/types';
import { extractSyllabusRows, type Term } from './extract';

export interface LineReaders {
  html(text: string): Promise<string[]>;
  pdf(bytes: ArrayBuffer): Promise<string[]>;
}

/** Downloads a syllabus file from Brightspace (with the student's session) and turns it into text lines. */
export async function readSyllabusFile(src: SyllabusSource, fetchImpl: typeof fetch, readers: LineReaders): Promise<string[]> {
  try {
    const res = await fetchImpl(src.url, { credentials: 'include' });
    if (!res.ok) return [];
    if (src.kind === 'pdf') return await readers.pdf(await res.arrayBuffer());
    if (src.kind === 'html') return await readers.html(await res.text());
    return [];
  } catch {
    return [];
  }
}

/** Brightspace term dates, else the fall (Aug–Dec) or spring (Jan–May) semester around now. */
export function courseTerm(c: { start?: string | null; end?: string | null }, now: Date): Term {
  if (c.start && c.end) return { start: new Date(c.start), end: new Date(c.end) };
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? { start: new Date(y, 7, 1), end: new Date(y, 11, 31, 23, 59) } : { start: new Date(y, 0, 1), end: new Date(y, 4, 31, 23, 59) };
}

export function syllabusFromLines(src: SyllabusSource, lines: string[], term: Term, now: Date): CourseSyllabus {
  const out: CourseSyllabus = { source: src.url, kind: src.kind, readAt: now.toISOString(), modified: src.modified, rows: extractSyllabusRows(lines, term, now) };
  if (lines.length === 0) out.error = 'unreadable';
  return out;
}
