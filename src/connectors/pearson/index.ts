import type { Connector, ConnectorResult } from '../../core/types';
import { PEARSON_ASSIGNMENTS_URL, parseScoreAnswer, type PearsonPage } from './parse';
import { createLimiter } from '../limit';

export interface PearsonOptions {
  /** Runs parsePearson where a DOM exists (offscreen document in the service worker). */
  parse(html: string): Promise<PearsonPage>;
  fetchImpl?: typeof fetch;
  /** For the dashboard-window check on score requests. */
  now?: () => Date;
}

const DAY = 86_400_000;
const MAX_SCORE_REQUESTS = 10;

const SIGN_IN = /sign\s*in|log\s*in|session (has )?expired|signin|piapi\/login/i;

/**
 * Pearson MyLab keeps due dates on its own site, reachable only while the browser has a MyLab session
 * (opened once from Brightspace's "Access Pearson"). No session → not_logged_in, and the UI asks to open Pearson.
 */
export function createPearsonConnector(opts: PearsonOptions): Connector {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  /** The same read-only callback the "see score" link sends. Failures leave the row without a score. */
  async function addScores(page: PearsonPage) {
    const cutoff = (opts.now?.() ?? new Date()).getTime() - 7 * DAY;
    const targets = (page.scoreCells ?? [])
      .filter((c) => new Date(c.dueAt).getTime() > cutoff)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, MAX_SCORE_REQUESTS);
    if (!targets.length || !Object.keys(page.form ?? {}).length) return;
    const url = new URL('./DoAssignments.aspx?view=all', PEARSON_ASSIGNMENTS_URL).href;
    const limit = createLimiter(2);
    await Promise.all(
      targets.map((t) =>
        limit(async () => {
          try {
            const res = await fetchImpl(url, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
              body: new URLSearchParams({ ...page.form, __CALLBACKID: '__Page', __CALLBACKPARAM: t.cellId }).toString(),
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return;
            const score = parseScoreAnswer(await res.text(), t.cellId);
            const item = page.items.find((i) => i.sourceItemId === t.itemId);
            if (score && item) item.score = { text: score, from: 'Pearson' };
          } catch {
            /* no score; the sync still succeeds */
          }
        }),
      ),
    );
  }
  async function fetchAll(): Promise<ConnectorResult> {
    let res: Response;
    try {
      // Don't follow redirects: without a session Pearson bounces to its sign-in site, which the extension may not
      // be allowed to reach — following would surface as an opaque network error instead of "please reopen Pearson".
      res = await fetchImpl(PEARSON_ASSIGNMENTS_URL, { credentials: 'include', redirect: 'manual' });
    } catch (e) {
      return { ok: false, reason: 'network', detail: String(e) };
    }
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { ok: false, reason: 'not_logged_in', detail: 'redirected (probably to the sign-in page)' };
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
      await addScores(page);
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
