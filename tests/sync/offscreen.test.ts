import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleOffscreenMessage, createProxyParser } from '../../src/sync/offscreenParser';
import { GradescopeParseError } from '../../src/connectors/gradescope/parse';

const home = readFileSync('tests/fixtures/gradescope/home.html', 'utf8');

describe('handleOffscreenMessage', () => {
  it('ignores messages not addressed to the offscreen page', () => {
    expect(handleOffscreenMessage({ type: 'sync' })).toBeUndefined();
  });
  it('parses home html', () => {
    const r = handleOffscreenMessage({ target: 'offscreen', kind: 'home', html: home });
    expect(r && 'data' in r && Array.isArray(r.data) && r.data.length).toBe(2);
  });
  it('returns the error name so the caller can rethrow the right type', () => {
    expect(handleOffscreenMessage({ target: 'offscreen', kind: 'home', html: '<p></p>' })).toMatchObject({ errorName: 'GradescopeParseError' });
  });
});

describe('createProxyParser', () => {
  it('ensures the document exists, then forwards and unwraps data', async () => {
    const ensure = vi.fn(async () => {});
    const send = vi.fn(async (msg: unknown) => handleOffscreenMessage(msg));
    const p = createProxyParser(send, ensure);
    await expect(p.home(home)).resolves.toHaveLength(2);
    expect(ensure).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ target: 'offscreen', kind: 'home', html: home });
  });
  it('rethrows GradescopeParseError', async () => {
    const p = createProxyParser(async (m) => handleOffscreenMessage(m), async () => {});
    await expect(p.course('<p></p>', '1')).rejects.toBeInstanceOf(GradescopeParseError);
  });
  it('throws when nobody answers', async () => {
    const p = createProxyParser(async () => undefined, async () => {});
    await expect(p.home('x')).rejects.toThrow(/offscreen/);
  });
});

describe('offscreen pearson kind', () => {
  it('parses a Pearson page', () => {
    const page = readFileSync('tests/fixtures/pearson/assignments.html', 'utf8');
    const r = handleOffscreenMessage({ target: 'offscreen', kind: 'pearson', html: page });
    expect(r && 'data' in r && (r.data as { items: unknown[] }).items.length).toBe(42);
  });
});

describe('handleOffscreenSyllabus', () => {
  it('turns an HTML syllabus into lines', async () => {
    const { handleOffscreenSyllabus } = await import('../../src/sync/syllabusLines');
    await expect(handleOffscreenSyllabus({ target: 'offscreen', kind: 'syllabusHtml', html: '<table><tr><td>Oct 14</td><td>Exam 2</td></tr></table>' })).resolves.toEqual({ data: ['Oct 14 | Exam 2'] });
  });
  it('turns a PDF syllabus (sent as base64) into lines', async () => {
    const { handleOffscreenSyllabus } = await import('../../src/sync/syllabusLines');
    const b64 = readFileSync('tests/fixtures/syllabus/schedule.pdf').toString('base64');
    await expect(handleOffscreenSyllabus({ target: 'offscreen', kind: 'syllabusPdf', base64: b64 })).resolves.toEqual({ data: ['Course Schedule', 'Oct 14 Exam 2', 'Nov 10 Project proposal due'] });
  });
  it('ignores other messages', async () => {
    const { handleOffscreenSyllabus } = await import('../../src/sync/syllabusLines');
    expect(handleOffscreenSyllabus({ target: 'offscreen', kind: 'home', html: '' })).toBeUndefined();
  });
});
