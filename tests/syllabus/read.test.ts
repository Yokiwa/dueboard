import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { courseTerm, readSyllabusFile, syllabusFromLines } from '../../src/syllabus/read';
import { pdfToLines } from '../../src/syllabus/pdf';
import { pageLines } from '../../src/visits/finders';

const B = 'https://purdue.brightspace.com';
const htmlLines = async (html: string) => pageLines(new DOMParser().parseFromString(html, 'text/html'));

describe('readSyllabusFile', () => {
  it('reads an HTML syllabus into lines', async () => {
    const fetchImpl = (async () => new Response('<table><tr><td>Oct 14</td><td>Exam 2</td></tr></table>', { status: 200 })) as typeof fetch;
    const lines = await readSyllabusFile({ ou: '1', kind: 'html', url: `${B}/s.html`, title: 'Schedule', modified: null }, fetchImpl, { html: htmlLines, pdf: async () => [] });
    expect(lines).toEqual(['Oct 14 | Exam 2']);
  });
  it('returns no lines on an error page', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 403 })) as typeof fetch;
    expect(await readSyllabusFile({ ou: '1', kind: 'pdf', url: `${B}/s.pdf`, title: 'S', modified: null }, fetchImpl, { html: htmlLines, pdf: async () => ['x'] })).toEqual([]);
  });
});

describe('pdfToLines', () => {
  it('reads a PDF syllabus line by line', async () => {
    const bytes = readFileSync('tests/fixtures/syllabus/schedule.pdf');
    const lines = await pdfToLines(new Uint8Array(bytes).buffer);
    expect(lines).toEqual(['Course Schedule', 'Oct 14 Exam 2', 'Nov 10 Project proposal due']);
  });
});

describe('courseTerm', () => {
  const now = new Date('2026-11-07T12:00:00-05:00');
  it('uses the Brightspace term dates', () => {
    expect(courseTerm({ start: '2026-08-20T04:00:00.000Z', end: '2026-12-20T04:59:00.000Z' }, now)).toEqual({ start: new Date('2026-08-20T04:00:00.000Z'), end: new Date('2026-12-20T04:59:00.000Z') });
  });
  it('falls back to the fall or spring semester around now', () => {
    expect(courseTerm({}, now)).toEqual({ start: new Date(2026, 7, 1), end: new Date(2026, 11, 31, 23, 59) });
    expect(courseTerm({ start: null, end: null }, new Date(2027, 1, 10))).toEqual({ start: new Date(2027, 0, 1), end: new Date(2027, 4, 31, 23, 59) });
  });
});

describe('syllabusFromLines', () => {
  it('records rows, or "unreadable" when nothing was read', () => {
    const now = new Date('2026-11-07T12:00:00-05:00');
    const src = { ou: '1', kind: 'pdf' as const, url: `${B}/s.pdf`, title: 'S', modified: 'm' };
    const term = { start: new Date(2026, 7, 1), end: new Date(2026, 11, 31) };
    expect(syllabusFromLines(src, ['Oct 14 | Exam 2'], term, now)).toMatchObject({ source: src.url, kind: 'pdf', readAt: now.toISOString(), modified: 'm', rows: [{ title: 'Exam 2' }] });
    expect(syllabusFromLines(src, [], term, now)).toMatchObject({ rows: [], error: 'unreadable' });
  });
});
