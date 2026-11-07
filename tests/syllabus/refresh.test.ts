import { describe, it, expect } from 'vitest';
import { refreshSyllabi } from '../../src/syllabus/refresh';
import { migrate } from '../../src/storage/store';

const B = 'https://purdue.brightspace.com';
const now = new Date('2026-11-07T12:00:00-05:00');
const course = (ou: string) => ({ source: 'brightspace' as const, sourceCourseId: ou, name: `C ${ou}`, code: `C ${ou}`, url: `${B}/d2l/home/${ou}`, start: '2026-08-20T04:00:00.000Z', end: '2026-12-20T04:59:00.000Z' });

describe('refreshSyllabi', () => {
  it('reads due syllabus files and checks navigation bars of courses without one', async () => {
    const store = migrate({
      snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], links: [], courses: [course('1'), course('2')], syllabusSources: [{ ou: '1', kind: 'html', url: `${B}/s.html`, title: 'Schedule', modified: null }] } },
    });
    const fetched: string[] = [];
    const fetchImpl = (async (url: string) => {
      fetched.push(String(url));
      if (String(url).endsWith('/s.html')) return new Response('<p>x</p>');
      return new Response(`<a href="/d2l/common/dialogs/quickLink/quickLink.d2l?ou=2&amp;type=lti&amp;rcode=SS">Syllabus</a>`);
    }) as typeof fetch;
    const patch = await refreshSyllabi(store, now, fetchImpl, { html: async () => ['Oct 14 | Exam 2'], pdf: async () => [] });
    expect(fetched.sort()).toEqual([`${B}/d2l/home/2`, `${B}/s.html`]);
    expect(patch.syllabus['1']).toMatchObject({ kind: 'html', rows: [{ title: 'Exam 2' }] });
    expect(patch.syllabusNav['2']).toEqual({ url: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=2&type=lti&rcode=SS`, checkedAt: now.toISOString() });
  });

  it('does nothing when syllabus suggestions are off', async () => {
    const store = migrate({ settings: { visits: 'auto', syllabus: false }, snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], links: [], courses: [course('1')] } } });
    const fetchImpl = (async () => {
      throw new Error('should not fetch');
    }) as unknown as typeof fetch;
    const patch = await refreshSyllabi(store, now, fetchImpl, { html: async () => [], pdf: async () => [] });
    expect(patch).toEqual({ syllabus: {}, syllabusNav: {} });
  });
});
