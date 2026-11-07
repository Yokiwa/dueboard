import { describe, it, expect, vi } from 'vitest';
import { parseDueText, extractWileyDue, watchForWileyDue } from '../../src/capture/wiley';

describe('parseDueText', () => {
  const now = new Date('2026-11-07T12:00:00-05:00');
  it('reads weekday, month, day, time and zone (EST)', () => {
    expect(parseDueText('Due Monday, Nov 9 at 11:59 PM (EST)', now)).toBe('2026-11-10T04:59:00.000Z');
  });
  it('handles EDT, CST and AM times', () => {
    expect(parseDueText('Due Friday, Oct 2 at 8:00 AM (EDT)', now)).toBe('2026-10-02T12:00:00.000Z');
    expect(parseDueText('Due Tuesday, Nov 10 at 12:30 AM (CST)', now)).toBe('2026-11-10T06:30:00.000Z');
  });
  it('picks the year closest to today', () => {
    expect(parseDueText('Due Tuesday, Jan 5 at 11:59 PM (EST)', new Date('2026-12-28T12:00:00-05:00'))).toBe('2027-01-06T04:59:00.000Z');
    expect(parseDueText('Due Sunday, Dec 20 at 11:59 PM (EST)', new Date('2027-01-03T12:00:00-05:00'))).toBe('2026-12-21T04:59:00.000Z');
  });
  it('null for anything else', () => {
    expect(parseDueText('70% score reduction will be applied to work submitted after due date', now)).toBeNull();
    expect(parseDueText('Due soon', now)).toBeNull();
  });
});

const page = (title: string, due: string) =>
  `<main><h1>${title}</h1><ul><li>10 questions</li><li><span>${due}</span><div>70% score reduction will be applied to work submitted after due date</div></li></ul></main>`;

describe('extractWileyDue', () => {
  const now = new Date('2026-11-07T12:00:00-05:00');
  it('finds the assignment title and its due date on the assessment page', () => {
    document.body.innerHTML = page('PHYS 172H - HW11 - FA26', 'Due Monday, Nov 9 at 11:59 PM (EST)');
    expect(extractWileyDue(document, now)).toEqual({ title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z' });
  });
  it('null until both are on the page', () => {
    document.body.innerHTML = '<main><h1>PHYS 172H - HW11 - FA26</h1></main>';
    expect(extractWileyDue(document, now)).toBeNull();
  });
});

describe('watchForWileyDue', () => {
  it('reports once when the single-page app finishes rendering', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const found = vi.fn();
    const stop = watchForWileyDue(document, found, () => new Date('2026-11-07T12:00:00-05:00'));
    document.getElementById('app')!.innerHTML = page('PHYS 172H - HW10 - FA26', 'Due Monday, Nov 2 at 11:59 PM (EST)');
    await new Promise((r) => setTimeout(r, 20));
    document.getElementById('app')!.append(document.createElement('p'));
    await new Promise((r) => setTimeout(r, 20));
    expect(found).toHaveBeenCalledTimes(1);
    expect(found).toHaveBeenCalledWith({ title: 'PHYS 172H - HW10 - FA26', dueAt: '2026-11-03T04:59:00.000Z' });
    stop();
  });
});

import { acceptCapture } from '../../src/capture/accept';

describe('acceptCapture (background check of content-script messages)', () => {
  const now = new Date('2026-11-07T12:00:00-05:00');
  const ok = { type: 'captureDue', platform: 'wiley', title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z' };
  it('accepts a well-formed message from a Wiley page', () => {
    expect(acceptCapture(ok, 'https://education.wiley.com/was/ui/v2/assessment-player/index.html?launchId=x', now)).toEqual({
      title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: now.toISOString(),
    });
  });
  it.each([
    ['another site', 'https://evil.example.com/', ok],
    ['no sender', undefined, ok],
    ['bad date', 'https://education.wiley.com/x', { ...ok, dueAt: 'tomorrow' }],
    ['date years away', 'https://education.wiley.com/x', { ...ok, dueAt: '2031-01-01T00:00:00.000Z' }],
    ['empty title', 'https://education.wiley.com/x', { ...ok, title: '  ' }],
    ['huge title', 'https://education.wiley.com/x', { ...ok, title: 'x'.repeat(400) }],
  ])('rejects %s', (_n, url, msg) => {
    expect(acceptCapture(msg, url as string | undefined, now)).toBeNull();
  });
});
