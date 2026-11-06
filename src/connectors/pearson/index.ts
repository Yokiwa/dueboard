import type { Connector, ConnectorResult } from '../../core/types';
import { PEARSON_ASSIGNMENTS_URL, type PearsonPage } from './parse';

export interface PearsonOptions {
  /** Runs parsePearson where a DOM exists (offscreen document in the service worker). */
  parse(html: string): Promise<PearsonPage>;
  fetchImpl?: typeof fetch;
}

const SIGN_IN = /sign\s*in|log\s*in|session (has )?expired|signin|piapi\/login/i;

/**
 * Pearson MyLab keeps due dates on its own site, reachable only while the browser has a MyLab session
 * (opened once from Brightspace's "Access Pearson"). No session → not_logged_in, and the UI asks to open Pearson.
 */
export function createPearsonConnector(opts: PearsonOptions): Connector {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  async function fetchAll(): Promise<ConnectorResult> {
    let res: Response;
    try {
      res = await fetchImpl(PEARSON_ASSIGNMENTS_URL, { credentials: 'include' });
    } catch (e) {
      return { ok: false, reason: 'network', detail: String(e) };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not_logged_in', detail: `HTTP ${res.status}` };
    if (!res.ok) return { ok: false, reason: 'network', detail: `HTTP ${res.status}` };
    if (res.redirected && !/DoAssignments/i.test(res.url)) return { ok: false, reason: 'not_logged_in', detail: `redirected to ${res.url}` };
    const html = await res.text();
    if (!/gridAssignments|assignement-list-table/.test(html)) {
      return SIGN_IN.test(html)
        ? { ok: false, reason: 'not_logged_in', detail: 'sign-in page' }
        : { ok: false, reason: 'parse_error', detail: 'no assignments table' };
    }
    try {
      const page = await opts.parse(html);
      return {
        ok: true,
        courses: [{ source: 'pearson', sourceCourseId: page.courseId, name: 'Pearson MyLab', code: null, url: PEARSON_ASSIGNMENTS_URL }],
        items: page.items,
        links: [],
        partial: [],
      };
    } catch (e) {
      return { ok: false, reason: 'parse_error', detail: String(e) };
    }
  }
  return { id: 'pearson', fetchAll };
}
