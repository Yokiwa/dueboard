import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFinder, type FinderWindow } from '../../src/visits/finders/run';
import type { VisitMessage } from '../../src/visits/messages';

/** The answers a frame sends (its "I'm here" report is checked separately). */
const answers = (sent: VisitMessage[]) => sent.filter((m) => m.type !== 'visitFrame');
const fakeWindow = (top: boolean, mode: 'due' | 'syllabus' = 'due', platform?: string): FinderWindow => {
  const w = { document, location: { href: 'https://www.aleks.com/hw7' }, __dueboardMode: mode, __dueboardPlatform: platform } as FinderWindow;
  w.top = top ? w : ({} as FinderWindow);
  return w;
};

describe('runFinder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.body.innerHTML = '<h1>Homework 7</h1><div id="meta"></div>';
  });
  afterEach(() => vi.useRealTimers());

  it('reports a due date that renders late, once', async () => {
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1000);
    document.getElementById('meta')!.textContent = 'Due Date: 11/10/2026 11:59 PM';
    await vi.advanceTimersByTimeAsync(12_000);
    expect(answers(sent)).toEqual([
      { type: 'visitFound', found: { title: 'Homework 7', dueAt: new Date(2026, 10, 10, 23, 59).toISOString(), evidence: 'Due Date: 11/10/2026 11:59 PM' }, frameUrl: 'https://www.aleks.com/hw7', top: true },
    ]);
  });

  it('the top frame reports "nothing found" at the time limit', async () => {
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(answers(sent)).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(answers(sent)).toEqual([{ type: 'visitFound', found: null, frameUrl: 'https://www.aleks.com/hw7', top: true }]);
  });

  it('a non-top frame stays silent when it finds nothing', async () => {
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(false), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(answers(sent)).toEqual([]);
  });

  it('syllabus mode sends page lines once the text settles', async () => {
    document.body.innerHTML = '<table><tr><td>Oct 14</td><td>Exam 2</td></tr></table>';
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true, 'syllabus'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(answers(sent)).toEqual([{ type: 'visitText', lines: ['Oct 14 | Exam 2'], frameUrl: 'https://www.aleks.com/hw7' }]);
  });
});

describe('runFinder injected again into the same frame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.body.innerHTML = '<h1>Homework 7</h1><p>Due Date: 11/10/2026 11:59 PM</p>';
  });
  afterEach(() => vi.useRealTimers());

  it('a frame that is already reading ignores the second injection', async () => {
    const sent: VisitMessage[] = [];
    const w = fakeWindow(true);
    runFinder(w, (m) => sent.push(m));
    runFinder(w, (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1000);
    expect(answers(sent)).toHaveLength(1);
  });
});

describe('runFinder says which frames loaded (for the visit log)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<h1>Homework 7</h1>';
  });
  afterEach(() => vi.useRealTimers());

  it('each frame first reports that it is there, without the address details after "?"', async () => {
    const sent: VisitMessage[] = [];
    const w = fakeWindow(false);
    w.location = { href: 'https://education.wiley.com/was/ui/v2/assessment-player/index.html?launchId=SECRET#/main' };
    runFinder(w, (m) => sent.push(m));
    expect(sent[0]).toEqual({ type: 'visitFrame', frameUrl: 'https://education.wiley.com/was/ui/v2/assessment-player/index.html', top: false });
  });
});
