import { domGradescopeParser, type GradescopeParser } from '../connectors/gradescope/parse';
import { parsePearson, type PearsonPage } from '../connectors/pearson/parse';
import { offscreenParser, offscreenParsePearson } from './offscreenParser';

export interface Parsers {
  gradescope: GradescopeParser;
  pearson: (html: string) => Promise<PearsonPage>;
}

/**
 * Chrome's MV3 service worker has no DOM, so pages are parsed in the offscreen document. Firefox's MV3 background is
 * an event page with a DOM, so it parses in place (and has no offscreen API).
 */
export function pickParsers(isFirefox: boolean): Parsers {
  if (isFirefox) return { gradescope: domGradescopeParser, pearson: async (html) => parsePearson(html) };
  return { gradescope: offscreenParser, pearson: offscreenParsePearson };
}

export const parsers: Parsers = pickParsers(import.meta.env.FIREFOX === true);
