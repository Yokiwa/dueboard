import { describe, it, expect } from 'vitest';
import { navbarSyllabusLink, syllabusDue, syllabusNavDue, syllabusSources, tocSyllabusSources } from '../../src/syllabus/sources';
import { migrate } from '../../src/storage/store';
import type { StoreShape } from '../../src/core/types';
import type { SyllabusSource } from '../../src/syllabus/sources';

const B = 'https://purdue.brightspace.com';
const now = new Date('2026-11-07T12:00:00-05:00');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const LTI = `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=S`;

describe('tocSyllabusSources', () => {
  const toc = {
    Modules: [
      {
        Title: 'Start Here', Modules: [], Topics: [
          { TopicId: 1, Title: 'Course Syllabus', Url: '/content/enforced/1-MA16100/Course Syllabus.pdf', TypeIdentifier: 'File', LastModifiedDate: '2026-08-20T00:00:00.000Z' },
          { TopicId: 2, Title: 'Syllabus', Url: LTI, TypeIdentifier: 'Link' },
          { TopicId: 3, Title: 'Lecture 1.pdf', Url: '/content/enforced/1-MA16100/Lecture1.pdf', TypeIdentifier: 'File' },
          { TopicId: 4, Title: 'Course Schedule', Url: '/content/enforced/1-MA16100/schedule.html', TypeIdentifier: 'File' },
          { TopicId: 5, Title: 'Syllabus (Word)', Url: '/content/enforced/1-MA16100/syllabus.docx', TypeIdentifier: 'File' },
          { TopicId: 6, Title: 'Our syllabus', Url: 'https://purdue.simplesyllabus.com/doc/abc', TypeIdentifier: 'Link' },
        ],
      },
    ],
  };
  it('finds syllabus files and launches, and skips everything else', () => {
    expect(tocSyllabusSources(toc, '1', B)).toEqual([
      { ou: '1', kind: 'pdf', url: `${B}/content/enforced/1-MA16100/Course%20Syllabus.pdf`, title: 'Course Syllabus', modified: '2026-08-20T00:00:00.000Z' },
      { ou: '1', kind: 'visit', url: `${B}${LTI}`, title: 'Syllabus', modified: null },
      { ou: '1', kind: 'html', url: `${B}/content/enforced/1-MA16100/schedule.html`, title: 'Course Schedule', modified: null },
      { ou: '1', kind: 'visit', url: 'https://purdue.simplesyllabus.com/doc/abc', title: 'Our syllabus', modified: null },
    ]);
  });
});

describe('navbarSyllabusLink', () => {
  it('finds the Syllabus link in the course navigation bar', () => {
    const html = `<nav><a class="d2l-navigation-s-link" href="/d2l/le/content/1/Home">Content</a><a class="d2l-navigation-s-link" href="/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&amp;type=lti&amp;rcode=SS-1">Syllabus</a></nav>`;
    expect(navbarSyllabusLink(html, B)).toBe(`${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=SS-1`);
  });
  it('null when there is none', () => {
    expect(navbarSyllabusLink('<nav><a href="/d2l/le/content/1/Home">Content</a></nav>', B)).toBeNull();
  });
});

const course = (ou: string) => ({ source: 'brightspace' as const, sourceCourseId: ou, name: `C ${ou}`, code: `C ${ou}`, url: `${B}/d2l/home/${ou}` });
const withSources = (sources: SyllabusSource[], extra: Record<string, unknown> = {}): StoreShape =>
  migrate({ snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], links: [], courses: [course('1'), course('2')], syllabusSources: sources } }, ...extra });
const pdf: SyllabusSource = { ou: '1', kind: 'pdf', url: `${B}/s.pdf`, title: 'Syllabus', modified: '2026-08-20T00:00:00.000Z' };
const visit: SyllabusSource = { ou: '1', kind: 'visit', url: `${B}${LTI}`, title: 'Syllabus', modified: null };

describe('syllabusDue', () => {
  it('reads a new source', () => {
    expect(syllabusDue(withSources([pdf]), now)).toEqual([pdf]);
  });
  it('skips one read recently that has not changed', () => {
    const s = withSources([pdf], { syllabus: { '1': { source: pdf.url, kind: 'pdf', readAt: daysAgo(3), modified: pdf.modified, rows: [] } } });
    expect(syllabusDue(s, now)).toEqual([]);
  });
  it('rereads when the file changed or a week passed', () => {
    const changed = withSources([{ ...pdf, modified: '2026-10-01T00:00:00.000Z' }], { syllabus: { '1': { source: pdf.url, kind: 'pdf', readAt: daysAgo(1), modified: pdf.modified, rows: [] } } });
    expect(syllabusDue(changed, now)).toHaveLength(1);
    const old = withSources([pdf], { syllabus: { '1': { source: pdf.url, kind: 'pdf', readAt: daysAgo(8), modified: pdf.modified, rows: [] } } });
    expect(syllabusDue(old, now)).toHaveLength(1);
  });
  it('one source per course, preferring Simple Syllabus-style launches', () => {
    expect(syllabusDue(withSources([pdf, visit]), now)).toEqual([visit]);
  });
  it('includes a launch found in the navigation bar', () => {
    const s = withSources([], { syllabusNav: { '2': { url: `${B}/nav/2`, checkedAt: daysAgo(1) } } });
    expect(syllabusDue(s, now)).toEqual([{ ou: '2', kind: 'visit', url: `${B}/nav/2`, title: 'Syllabus', modified: null }]);
  });
  it('nothing when syllabus suggestions are off', () => {
    expect(syllabusDue(withSources([pdf], { settings: { visits: 'auto', syllabus: false } }), now)).toEqual([]);
  });
});

describe('syllabusNavDue', () => {
  it('checks the navigation bar weekly for courses without a syllabus in Content', () => {
    const s = withSources([pdf], { syllabusNav: { '2': { url: null, checkedAt: daysAgo(3) } } });
    expect(syllabusNavDue(s, now)).toEqual([]);
    expect(syllabusNavDue(withSources([pdf]), now)).toEqual(['2']);
    expect(syllabusNavDue(withSources([pdf], { syllabusNav: { '2': { url: null, checkedAt: daysAgo(8) } } }), now)).toEqual(['2']);
  });
});

describe('syllabusSources', () => {
  it('combines Content and navigation-bar sources', () => {
    const s = withSources([pdf], { syllabusNav: { '2': { url: `${B}/nav/2`, checkedAt: daysAgo(1) } } });
    expect(syllabusSources(s).map((x) => x.ou)).toEqual(['1', '2']);
  });
});

describe('documents that list due dates', () => {
  it('reads "Assignments and due dates" and "Important dates" documents like a syllabus', () => {
    const toc = { Modules: [{ Title: 'Start', Modules: [], Topics: [
      { TopicId: 1, Title: 'Assignments and due dates_11510_FA26_rev 10.16', Url: '/content/enforced/1-CHM/Assignments and due dates.pdf', TypeIdentifier: 'File' },
      { TopicId: 2, Title: 'Due Dates', Url: '/content/enforced/1-CHM/due.html', TypeIdentifier: 'File' },
      { TopicId: 3, Title: 'Lecture 4 slides', Url: '/content/enforced/1-CHM/l4.pdf', TypeIdentifier: 'File' },
    ] }] };
    expect(tocSyllabusSources(toc, '1', B).map((s) => s.title)).toEqual(['Assignments and due dates_11510_FA26_rev 10.16', 'Due Dates']);
  });
});
