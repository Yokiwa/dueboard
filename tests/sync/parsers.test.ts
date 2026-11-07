import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { offscreenParser, offscreenParsePearson } from '../../src/sync/offscreenParser';
import { pickParsers } from '../../src/sync/parsers';
import { domGradescopeParser } from '../../src/connectors/gradescope/parse';

const home = readFileSync('tests/fixtures/gradescope/home.html', 'utf8');

describe('pickParsers', () => {
  it('parses in place on Firefox, whose background page has a DOM', async () => {
    const p = pickParsers(true);
    expect(p.gradescope).toBe(domGradescopeParser);
    expect(await p.gradescope.home(home)).toHaveLength(2);
  });

  it('goes through the offscreen document on Chrome', () => {
    const p = pickParsers(false);
    expect(p.gradescope).toBe(offscreenParser);
    expect(p.pearson).toBe(offscreenParsePearson);
  });
});

describe('pickParsers: syllabus readers', () => {
  it('reads syllabus HTML in place on Firefox', async () => {
    expect(await pickParsers(true).syllabus.html('<p>Oct 14 Exam 2</p>')).toEqual(['Oct 14 Exam 2']);
  });
  it('sends syllabus files to the offscreen document on Chrome', async () => {
    const { offscreenSyllabusReaders } = await import('../../src/sync/offscreenParser');
    expect(pickParsers(false).syllabus).toBe(offscreenSyllabusReaders);
  });
});
