import type { CompletionRecord, Connector, ConnectorResult } from '../../core/types';
import { PEARSON_ASSIGNMENTS_URL, parseScoreAnswer, type PearsonPage } from './parse';
import { createLimiter } from '../limit';

export interface PearsonOptions {
  /** Runs parsePearson where a DOM exists (offscreen document in the service worker). */
  parse(html: string): Promise<PearsonPage>;
  /** Already rendered in an authenticated hidden frame; used only for this resync. */
  sessionHtml?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** What is already known, so rows known done are asked again only for regrades (see addScores). */
  completion?: () => Promise<Record<string, CompletionRecord>>;
}

const DAY = 86_400_000;
const MAX_SCORE_REQUESTS = 10;
/** Done work due within this many days is asked for its score again once a day. */
const REGRADE_DAYS = 14;

const SIGN_IN = /sign\s*in|log\s*in|session (has )?expired|signin|piapi\/login/i;

/**
 * Pearson MyLab keeps due dates on its own site, reachable only while the browser has a MyLab session
 * (opened once from Brightspace's "Access Pearson"). No session → not_logged_in, and the UI asks to open Pearson.
 */
export function createPearsonConnector(opts: PearsonOptions): Connector {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  /** The same read-only callback the "see score" link sends. Failures leave the row without a score. */
  async function addScores(page: PearsonPage) {
    // Rows not known done, of any date; rows known done only when due in the last 14 days and not checked for a day
    // (a regrade).
    const now = (opts.now?.() ?? new Date()).getTime();
    const known = (await opts.completion?.().catch(() => undefined)) ?? {};
    const wanted = (c: { itemId: string; dueAt: string }) => {
      const r = known[`pearson:${c.itemId}`];
      if (r?.state !== 'done') return true;
      const due = Date.parse(c.dueAt);
      return due <= now && due > now - REGRADE_DAYS * DAY && now - Date.parse(r.checkedAt) > DAY;
    };
    // Past-due rows first (the ones Overdue and "Not sure" wait on), the most recently due first; then rows not due yet.
    const pastDue = (c: { dueAt: string }) => Date.parse(c.dueAt) <= now;
    const targets = (page.scoreCells ?? [])
      .filter(wanted)
      .sort((a, b) => Number(pastDue(b)) - Number(pastDue(a)) || Date.parse(b.dueAt) - Date.parse(a.dueAt))
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
    const result = await fetchPage();
    // Some browsers let the frame authenticate without sharing its session with a worker fetch.
    return !result.ok && opts.sessionHtml !== undefined ? readPage(opts.sessionHtml) : result;
  }

  async function fetchPage(): Promise<ConnectorResult> {
    let res: Response;
    try {
      // Don't follow redirects: without a session Pearson bounces to its sign-in site, which the extension may not
      // be allowed to reach — following would surface as an opaque network error instead of "please reopen Pearson".
      res = await fetchImpl(PEARSON_ASSIGNMENTS_URL, { credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
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
    return readPage(html);
  }

  async function readPage(html: string): Promise<ConnectorResult> {
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
