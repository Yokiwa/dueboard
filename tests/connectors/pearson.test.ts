import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePearson, PearsonParseError, PEARSON_ASSIGNMENTS_URL } from '../../src/connectors/pearson/parse';
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
