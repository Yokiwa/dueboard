import { AuthError, getHtml } from '../http';
import { createLimiter } from '../limit';
import type { Connector, ConnectorResult, RawItem } from '../../core/types';
import { GS_BASE, GradescopeParseError, type GradescopeParser } from './parse';

export interface GradescopeOptions {
  parser: GradescopeParser;
  fetchImpl?: typeof fetch;
}

const LOGIN_FORM = /<form[^>]+action="\/login"/i;

export function createGradescopeConnector(opts: GradescopeOptions): Connector {
  const limit = createLimiter(4);
  const page = (url: string) =>
    limit(async () => {
      const html = await getHtml(url, opts.fetchImpl);
      if (LOGIN_FORM.test(html)) throw new AuthError(`${url}: login form`);
      return html;
    });

  async function fetchAll(): Promise<ConnectorResult> {
    try {
      const courses = await Promise.resolve(opts.parser.home(await page(`${GS_BASE}/account`)));
      const items: RawItem[] = [];
      const partial: string[] = [];
      await Promise.all(
        courses.map(async (c) => {
          try {
            const html = await page(`${GS_BASE}/courses/${c.sourceCourseId}`);
            items.push(...(await Promise.resolve(opts.parser.course(html, c.sourceCourseId))));
          } catch (e) {
            if (e instanceof AuthError) throw e;
            partial.push(c.sourceCourseId);
          }
        }),
      );
      partial.sort();
      return { ok: true, courses, items, links: [], partial };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, reason: 'not_logged_in', detail: e.message };
      if (e instanceof GradescopeParseError || (e as Error)?.name === 'GradescopeParseError') {
        return { ok: false, reason: 'parse_error', detail: (e as Error).message };
      }
      return { ok: false, reason: 'network', detail: String(e) };
    }
  }

  return { id: 'gradescope', fetchAll };
}
