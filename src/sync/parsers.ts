import { domGradescopeParser, type GradescopeParser } from '../connectors/gradescope/parse';
import { parsePearson, type PearsonPage } from '../connectors/pearson/parse';
import { offscreenParser, offscreenParsePearson, offscreenSyllabusReaders } from './offscreenParser';
import { inPlaceSyllabusReaders } from './syllabusLines';
import type { LineReaders } from '../syllabus/read';

export interface Parsers {
  gradescope: GradescopeParser;
  pearson: (html: string) => Promise<PearsonPage>;
  /** Syllabus files (HTML, PDF) → text lines. */
  syllabus: LineReaders;
}

/**
 * Chrome's MV3 service worker has no DOM, so pages are parsed in the offscreen document. Firefox's MV3 background is
 * an event page with a DOM, so it parses in place (and has no offscreen API).
 */
export function pickParsers(isFirefox: boolean): Parsers {
  return isFirefox ? firefoxParsers() : chromeParsers();
}
function firefoxParsers(): Parsers {
  return { gradescope: domGradescopeParser, pearson: async (html) => parsePearson(html), syllabus: inPlaceSyllabusReaders };
}
function chromeParsers(): Parsers {
  return { gradescope: offscreenParser, pearson: offscreenParsePearson, syllabus: offscreenSyllabusReaders };
}

// A build-time constant, so each browser's bundle keeps only its own branch (pdf.js stays out of Chrome's worker).
export const parsers: Parsers = import.meta.env.FIREFOX ? firefoxParsers() : chromeParsers();
