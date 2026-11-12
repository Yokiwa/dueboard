import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { findListed } from '../../src/visits/finders/listed';
import { runFinder, type FinderWindow } from '../../src/visits/finders/run';
import type { ListedTitle } from '../../src/visits/frame/protocol';

const now = new Date(2026, 10, 7, 12, 0);
const local = (mo: number, d: number, h = 23, mi = 59) => new Date(2026, mo - 1, d, h, mi).toISOString();
const page = (html: string) => {
  document.body.innerHTML = html;
  return document;
};
const t = (key: string, title: string): ListedTitle => ({ key, title });

describe('findListed', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('dates each title from its own table row, with the row as evidence', () => {
    const d = page(`<table>
      <tr><td>HW11 (10.3, 12.1)</td><td>Due Nov 11 at 11:59 PM</td><td>10 pts</td></tr>
      <tr><td>HW12 (12.2)</td><td>Due Nov 18 at 11:59 PM</td></tr></table>`);
    expect(findListed(d, [t('a', 'HW11 (10.3, 12.1)'), t('b', 'HW12 (12.2)')], now)).toEqual([
      { key: 'a', found: { title: 'HW11 (10.3, 12.1)', dueAt: local(11, 11), evidence: 'HW11 (10.3, 12.1) | Due Nov 11 at 11:59 PM | 10 pts' } },
      { key: 'b', found: { title: 'HW12 (12.2)', dueAt: local(11, 18), evidence: 'HW12 (12.2) | Due Nov 18 at 11:59 PM' } },
    ]);
  });

  it('reads a card list shaped like a course page (name link, then date and points spans)', () => {
    const row = (name: string, due: string) =>
      `<div class="row"><div class="name"><a href="/c/x">${name}</a></div><div><span>Due ${due}</span><span>&nbsp;|&nbsp;10 pts</span></div></div>`;
    const d = page(`<div class="list">${row('Reading check 3', 'Nov 11 at 11:59 PM')}${row('Reading check 4', 'Nov 18 at 11:59 PM')}</div>`);
    const out = findListed(d, [t('a', 'Reading check 3'), t('b', 'Reading check 4')], now);
    expect(out.map((l) => [l.key, l.found.dueAt])).toEqual([['a', local(11, 11)], ['b', local(11, 18)]]);
  });

  it('matches whole words in order: "HW 1" is not "HW 11"', () => {
    const d = page('<table><tr><td>HW 11</td><td>Due Nov 11 at 11:59 PM</td></tr></table>');
    expect(findListed(d, [t('a', 'HW 1')], now)).toEqual([]);
    expect(findListed(d, [t('a', 'HW 11')], now)).toHaveLength(1);
    expect(findListed(d, [t('a', '11 HW')], now)).toEqual([]);
  });

  it('gives nothing for a title found in two rows with different dates, one entry for the same date twice', () => {
    const two = page('<table><tr><td>Lab report 2</td><td>Due Nov 11</td></tr><tr><td>Lab report 2</td><td>Due Nov 18</td></tr></table>');
    expect(findListed(two, [t('a', 'Lab report 2')], now)).toEqual([]);
    const same = page('<table><tr><td>Lab report 2</td><td>Due Nov 11</td></tr><tr><td>Lab report 2</td><td>Due Nov 11</td></tr></table>');
    expect(findListed(same, [t('a', 'Lab report 2')], now)).toHaveLength(1);
  });

  it('needs a due-labeled date in the same row', () => {
    const noDue = page('<table><tr><td>Lab report 2</td><td>Available Nov 11</td></tr><tr><td>Lab report 3</td><td>Opens Nov 12</td></tr></table>');
    expect(findListed(noDue, [t('a', 'Lab report 2'), t('b', 'Lab report 3')], now)).toEqual([]);
    const other = page('<table><tr><td>Lab report 2</td><td>10 pts</td></tr><tr><td>Lab report 9</td><td>Due Nov 11</td></tr></table>');
    expect(findListed(other, [t('a', 'Lab report 2')], now)).toEqual([]);
  });

  it('never matches titles under 2 words and 4 characters', () => {
    const d = page('<table><tr><td>Q1</td><td>Due Nov 11</td></tr><tr><td>HW11</td><td>Due Nov 12</td></tr><tr><td>A 1</td><td>Due Nov 13</td></tr></table>');
    expect(findListed(d, [t('a', 'Q1'), t('b', 'HW11'), t('c', 'A 1')], now).map((l) => l.key)).toEqual(['b', 'c']);
  });

  it('reads a label-and-value layout in small blocks', () => {
    const d = page('<div><div>HW 5</div><div>Due: Nov 12</div></div>');
    expect(findListed(d, [t('a', 'HW 5')], now)).toEqual([
      { key: 'a', found: { title: 'HW 5', dueAt: local(11, 12), evidence: 'HW 5 Due: Nov 12' } },
    ]);
  });

  it('trims evidence to 120 characters', () => {
    const d = page(`<table><tr><td>HW 5 ${'x'.repeat(200)}</td><td>Due Nov 12</td></tr></table>`);
    // the title words must be next to each other; the long filler keeps them so
    expect(findListed(d, [t('a', 'HW 5')], now)[0]!.found.evidence).toHaveLength(120);
  });
});

describe('runFinder with titles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    document.body.innerHTML = '<table><tr><td>HW 5</td><td>Due Nov 12</td></tr><tr><td>HW 6</td><td>Due Nov 19</td></tr></table>';
  });
  afterEach(() => vi.useRealTimers());

  const win = (top: boolean, titles?: ListedTitle[], href = 'https://www.aleks.com/list'): FinderWindow & { __dueboardTitles?: ListedTitle[] } => {
    const w = { document, location: { href }, __dueboardMode: 'due', __dueboardTitles: titles } as FinderWindow & { __dueboardTitles?: ListedTitle[] };
    w.top = top ? w : ({} as FinderWindow);
    return w;
  };
  const titles = [t('a', 'HW 5'), t('b', 'HW 6')];

  it('sends the listed dates once, just before the final "nothing" message', async () => {
    const sent: { type: string }[] = [];
    runFinder(win(true, titles), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(sent.map((m) => m.type)).toEqual(['visitFrame', 'visitListed', 'visitSample', 'visitFound']);
    const listed = sent[1] as unknown as { listed: { key: string }[] };
    expect(listed.listed.map((l) => l.key)).toEqual(['a', 'b']);
  });

  it('a non-top frame also sends it, before its sample', async () => {
    const sent: { type: string }[] = [];
    runFinder(win(false, titles), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(sent.map((m) => m.type)).toEqual(['visitFrame', 'visitListed', 'visitSample']);
  });

  it('sends nothing without titles, with no list, or from a Brightspace page', async () => {
    const a: { type: string }[] = [];
    runFinder(win(true, undefined), (m) => a.push(m));
    const b: { type: string }[] = [];
    runFinder(win(true, [t('z', 'Nothing here')]), (m) => b.push(m));
    const c: { type: string }[] = [];
    runFinder(win(true, titles, 'https://purdue.brightspace.com/d2l/x'), (m) => c.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    for (const sent of [a, b, c]) expect(sent.some((m) => m.type === 'visitListed')).toBe(false);
  });

  it('sends the listed dates before a found date', async () => {
    document.body.innerHTML = '<h1>Course</h1><table><tr><td>HW 5</td><td>Due Nov 12</td></tr></table>';
    const sent: { type: string }[] = [];
    runFinder(win(true, [t('a', 'HW 5')]), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent.map((m) => m.type)).toEqual(['visitFrame', 'visitListed', 'visitFound']);
  });
});
