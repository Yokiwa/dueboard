import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePearson, parseScoreAnswer, PearsonParseError, PEARSON_ASSIGNMENTS_URL } from '../../src/connectors/pearson/parse';
import { createPearsonConnector } from '../../src/connectors/pearson';
import { fakeFetch } from '../helpers/fakeFetch';

const page = readFileSync('tests/fixtures/pearson/assignments.html', 'utf8');
const login = readFileSync('tests/fixtures/pearson/login.html', 'utf8');

describe('parsePearson (real MA 26100 page)', () => {
  const r = parsePearson(page);

  it('reads the course id and all 42 assignments', () => {
    expect(r.courseId).toBe('14285764');
    expect(r.items).toHaveLength(42);
  });

  it('maps an open homework row', () => {
    expect(r.items.find((i) => i.sourceItemId === '729259669')).toEqual({
      source: 'pearson',
      sourceItemId: '729259669',
      sourceCourseId: '14285764',
      title: "Lesson 29- Section 17.4 - Green's Theorem",
      type: 'assignment',
      dueAt: new Date(2026, 10, 10, 23, 59).toISOString(),
      url: PEARSON_ASSIGNMENTS_URL,
      submitted: false,
    });
  });

  it('closed past-due rows (no longer workable) count as done', () => {
    const first = r.items.find((i) => i.sourceItemId === '729259636')!;
    expect(first.title).toBe('Lesson 1, Part 1- Section 13.1- Review of Vectors and Geometry of Space');
    expect(first.dueAt).toBe(new Date(2026, 7, 29, 23, 59).toISOString());
    expect(first.submitted).toBe(true);
  });

  it('every item has an id, a title and a date', () => {
    for (const i of r.items) {
      expect(i.sourceItemId).toMatch(/^\d+$/);
      expect(i.title.length).toBeGreaterThan(3);
      expect(i.dueAt).not.toBeNull();
    }
  });

  it('12:xx am/pm convert correctly', () => {
    const html = page.replace('11/10/26<br>11:59pm', '11/10/26<br>12:05am').replace('11/12/26<br>11:59pm', '11/12/26<br>12:30pm');
    const items = parsePearson(html).items;
    expect(items.find((i) => i.sourceItemId === '729259669')!.dueAt).toBe(new Date(2026, 10, 10, 0, 5).toISOString());
    expect(items.find((i) => i.sourceItemId === '729259671')!.dueAt).toBe(new Date(2026, 10, 12, 12, 30).toISOString());
  });

  it('throws when there is no assignments table', () => {
    expect(() => parsePearson(login)).toThrow(PearsonParseError);
  });
});

describe('pearson connector', () => {
  const connector = (routes: Parameters<typeof fakeFetch>[0]) =>
    createPearsonConnector({ parse: async (h) => parsePearson(h), fetchImpl: fakeFetch(routes).impl });

  it('reads the assignments page with the browser session', async () => {
    const r = await connector({ [PEARSON_ASSIGNMENTS_URL]: { body: page } }).fetchAll();
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.courses).toEqual([{ source: 'pearson', sourceCourseId: '14285764', name: 'Pearson MyLab', code: null, url: PEARSON_ASSIGNMENTS_URL }]);
    expect(r.items).toHaveLength(42);
  });

  it('not_logged_in when Pearson sends us to sign in', async () => {
    const r = await connector({ [PEARSON_ASSIGNMENTS_URL]: { body: login, redirectedTo: 'https://login.pearson.com/v1/piapi/login/webcredentials' } }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('not_logged_in when the page is a sign-in form without a redirect', async () => {
    const r = await connector({ [PEARSON_ASSIGNMENTS_URL]: { body: login } }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'not_logged_in' });
  });

  it('parse_error for an unknown page that is not a sign-in page', async () => {
    const r = await connector({ [PEARSON_ASSIGNMENTS_URL]: { body: '<html><body>New Pearson design</body></html>' } }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'parse_error' });
  });

  it('network on HTTP 500', async () => {
    const r = await connector({ [PEARSON_ASSIGNMENTS_URL]: { status: 500, body: '' } }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'network' });
  });
});

describe('pearson redirects', () => {
  const opaque = (async () => ({ type: 'opaqueredirect', status: 0, ok: false, redirected: false, url: '', text: async () => '' })) as unknown as typeof fetch;

  it('does not follow redirects, so a hop to the sign-in site is reported as not_logged_in', async () => {
    let init: RequestInit | undefined;
    const spy = (async (_u: RequestInfo | URL, i?: RequestInit) => {
      init = i;
      return opaque('');
    }) as typeof fetch;
    const r = await createPearsonConnector({ parse: async (h) => parsePearson(h), fetchImpl: spy }).fetchAll();
    expect(init?.redirect).toBe('manual');
    expect(r).toMatchObject({ ok: false, reason: 'not_logged_in' });
    if (!r.ok) expect(r.detail).toContain('redirect');
  });

  it('keeps the error message when the request itself fails', async () => {
    const boom = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const r = await createPearsonConnector({ parse: async (h) => parsePearson(h), fetchImpl: boom }).fetchAll();
    expect(r).toMatchObject({ ok: false, reason: 'network', detail: 'TypeError: Failed to fetch' });
  });
});

describe('pearson scores', () => {
  const scores = readFileSync('tests/fixtures/pearson/scores.html', 'utf8');
  const NOW = new Date(2026, 10, 10, 12, 0);

  it('parsePearson keeps score cells, the form and a shown score', () => {
    const r = parsePearson(scores);
    expect(r.scoreCells).toEqual([{ itemId: '100', cellId: 'H_100_IVF_2_False', dueAt: new Date(2026, 10, 9, 23, 59).toISOString() }]);
    expect(r.form).toEqual({ __VIEWSTATE: 'VS', __EVENTTARGET: '' });
    expect(r.items.find((i) => i.sourceItemId === '101')!.score).toEqual({ text: '100%', from: 'Pearson' });
    expect(r.items.find((i) => i.sourceItemId === '100')!.score).toBeUndefined();
    expect(r.items.find((i) => i.sourceItemId === '102')!.score).toBeUndefined();
  });

  it('parseScoreAnswer', () => {
    const id = 'H_100_IVF_2_False';
    expect(parseScoreAnswer('sH_100_IVF_2_False_92%', id)).toBe('92%');
    expect(parseScoreAnswer('12|abcdefghijklsH_100_IVF_2_False_92%', id)).toBe('92%');
    expect(parseScoreAnswer('sH_100_IVF_2_False_92 %', id)).toBe('92%');
    expect(parseScoreAnswer('sH_100_IVF_2_False_105%', id)).toBe('105%');
    expect(parseScoreAnswer('sH_100_IVF_2_False_999%', id)).toBeNull();
    expect(parseScoreAnswer('eError', id)).toBeNull();
    expect(parseScoreAnswer('sH_100_92%', id)).toBeNull();
    expect(parseScoreAnswer('sH_999_IVF_2_False_92%', id)).toBeNull();
    expect(parseScoreAnswer('<html>Sign in</html>', id)).toBeNull();
  });

  it('collects selects and textareas, skips disabled controls', () => {
    const html = scores.replace('<input type="submit" id="nameless">', '<select name="S"><option value="a">A</option><option value="b" selected>B</option></select><textarea name="T">hi</textarea><input type="hidden" name="D" value="x" disabled>');
    expect(parsePearson(html).form).toEqual({ __VIEWSTATE: 'VS', __EVENTTARGET: '', S: 'b', T: 'hi' });
  });

  interface Call { url: string; init?: RequestInit }
  function spy(post: (body: URLSearchParams) => string | Promise<string>, list = scores) {
    const calls: Call[] = [];
    const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(u), init });
      if (init?.method === 'POST') return new Response(await post(new URLSearchParams(String(init.body))), { status: 200 });
      return new Response(list, { status: 200 });
    }) as typeof fetch;
    return { impl, calls };
  }
  const postsOf = (s: { calls: { url: string; init?: RequestInit }[] }) => s.calls.filter((c) => c.init?.method === 'POST');
  const make = (impl: typeof fetch) => createPearsonConnector({ parse: async (h) => parsePearson(h), fetchImpl: impl, now: () => NOW });

  it('asks the callback for a see-score cell', async () => {
    const s = spy((b) => `s${b.get('__CALLBACKPARAM')}_92%`);
    const r = await make(s.impl).fetchAll();
    if (!r.ok) throw new Error('not ok');
    expect(r.items.find((i) => i.sourceItemId === '100')!.score).toEqual({ text: '92%', from: 'Pearson' });
    const posts = s.calls.filter((c) => c.init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe('https://mylab.pearson.com/Student/DoAssignments.aspx?view=all');
    expect(posts[0]!.init!.credentials).toBe('include');
    const body = String(posts[0]!.init!.body);
    expect(body).toContain('__CALLBACKID=__Page');
    expect(body).toContain('__CALLBACKPARAM=H_100_IVF_2_False');
    expect(body).toContain('__VIEWSTATE=VS');
  });

  const many = (dates: string[]) =>
    scores.replace(/<tr>[\s\S]*<\/tr>/, dates.map((d, i) => `<tr><td><div class="past due nowrap">${d}<br>11:59pm</div></td><th scope="row"><a>HW ${i}</a><i title="Homework"></i></th><td><div id="H_${200 + i}_IVF_2_False"><a href="javascript:WebForm_DoCallback('__Page','H_${200 + i}_IVF_2_False',x)">see score</a></div></td></tr>`).join('\n'));

  it('sends at most 10 requests, most recently due first', async () => {
    const dates = Array.from({ length: 15 }, (_, i) => `11/${String(25 - i).padStart(2, '0')}/26`); // 25 down to 11
    const s = spy((b) => `s${b.get('__CALLBACKPARAM')}_90%`, many(dates));
    const r = await make(s.impl).fetchAll();
    if (!r.ok) throw new Error('not ok');
    const params = s.calls.filter((c) => c.init?.method === 'POST').map((c) => new URLSearchParams(String(c.init!.body)).get('__CALLBACKPARAM'));
    expect(params).toHaveLength(10);
    // most recently due = 11/25 = index 0, then 1, ... up to index 9
    expect(new Set(params)).toEqual(new Set(Array.from({ length: 10 }, (_, k) => `H_${200 + k}_IVF_2_False`)));
    expect(params[0]).toBe('H_200_IVF_2_False');
  });

  it('past-due rows are asked before rows not due yet (10 future rows never crowd them out)', async () => {
    // NOW is 11/10: ten rows due later in November first, then two past-due rows.
    const future = ['11/15/26', '11/16/26', '11/17/26', '11/18/26', '11/19/26', '11/20/26', '11/21/26', '11/22/26', '11/23/26', '11/24/26'];
    const s = spy((b) => `s${b.get('__CALLBACKPARAM')}_90%`, many([...future, '10/31/26', '09/01/26']));
    await createPearsonConnector({ parse: async (h) => parsePearson(h), fetchImpl: s.impl, now: () => NOW, completion: async () => ({}) }).fetchAll();
    const params = postsOf(s).map((c) => new URLSearchParams(String(c.init!.body)).get('__CALLBACKPARAM'));
    expect(params).toHaveLength(10);
    expect(params).toContain('H_210_IVF_2_False');
    expect(params).toContain('H_211_IVF_2_False');
  });

  it('asks rows of any age not known done; a row known done only when due in the last 14 days and not checked today', async () => {
    // NOW is 11/10. Rows: 09/01 (long past), 10/31 (10 days ago), 11/01 (9 days ago), 10/20 (21 days ago).
    const s = spy((b) => `s${b.get('__CALLBACKPARAM')}_90%`, many(['09/01/26', '10/31/26', '11/01/26', '10/20/26']));
    const day = 86_400_000;
    const completion = {
      // done, due in the last 14 days, checked 2 days ago: asked again (a regrade)
      'pearson:201': { state: 'done' as const, by: 'score' as const, checkedAt: new Date(NOW.getTime() - 2 * day).toISOString() },
      // done, due in the last 14 days, checked an hour ago: not asked
      'pearson:202': { state: 'done' as const, by: 'score' as const, checkedAt: new Date(NOW.getTime() - 3_600_000).toISOString() },
      // done, due 21 days ago: never asked again
      'pearson:203': { state: 'done' as const, by: 'score' as const, checkedAt: new Date(NOW.getTime() - 5 * day).toISOString() },
    };
    await createPearsonConnector({ parse: async (h) => parsePearson(h), fetchImpl: s.impl, now: () => NOW, completion: async () => completion }).fetchAll();
    const params = postsOf(s).map((c) => new URLSearchParams(String(c.init!.body)).get('__CALLBACKPARAM'));
    expect(new Set(params)).toEqual(new Set(['H_200_IVF_2_False', 'H_201_IVF_2_False']));
  });

  it('a rejected or sign-in callback never fails the sync', async () => {
    for (const post of [() => Promise.reject(new Error('boom')), () => '<html>Sign in</html>']) {
      const r = await make(spy(post).impl).fetchAll();
      if (!r.ok) throw new Error('not ok');
      expect(r.items).toHaveLength(3);
      expect(r.items.find((i) => i.sourceItemId === '100')!.score).toBeUndefined();
    }
  });


  it('a crossed answer for another assignment gives no score', async () => {
    const r = await make(spy(() => 'sH_999_IVF_2_False_92%').impl).fetchAll();
    if (!r.ok) throw new Error('not ok');
    expect(r.items.find((i) => i.sourceItemId === '100')!.score).toBeUndefined();
  });

  it('no form, no requests', async () => {
    const s = spy(() => 'x', scores.replace('id="aspnetForm"', 'id="other"'));
    const r = await make(s.impl).fetchAll();
    expect(r.ok).toBe(true);
    expect(postsOf(s)).toHaveLength(0);
  });

  it('an existing __CALLBACKID input is overridden, not duplicated', async () => {
    const s = spy((b) => `s${b.get('__CALLBACKPARAM')}_92%`, scores.replace('<input type="submit"', '<input type="hidden" name="__CALLBACKID" value="other"><input type="submit"'));
    await make(s.impl).fetchAll();
    const body = new URLSearchParams(String(postsOf(s)[0]!.init!.body));
    expect(body.getAll('__CALLBACKID')).toEqual(['__Page']);
  });

  it('a redirect answer gives no score but the sync is ok', async () => {
    const impl = (async (_u: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? new Response('', { status: 302, headers: { location: 'https://login.example/' } }) : new Response(scores)) as typeof fetch;
    const r = await make(impl).fetchAll();
    if (!r.ok) throw new Error('not ok');
    expect(r.items).toHaveLength(3);
    expect(r.items.find((i) => i.sourceItemId === '100')!.score).toBeUndefined();
  });

});
