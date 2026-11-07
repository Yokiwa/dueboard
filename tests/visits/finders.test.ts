import { describe, it, expect, beforeEach } from 'vitest';
import { findDue, findDueUniversal, findDueWiley, pageLines } from '../../src/visits/finders';

const now = new Date(2026, 10, 7, 12, 0);
const local = (y: number, mo: number, d: number, h = 23, mi = 59) => new Date(y, mo - 1, d, h, mi).toISOString();
const page = (html: string, title = 'Page') => {
  document.title = title;
  document.body.innerHTML = html;
  return document;
};

describe('findDueUniversal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads an ALEKS-style assignment page', () => {
    const d = page('<h1>Homework 7</h1><div class="meta"><span>Due Date:</span> <span>11/10/2026 11:59 PM</span></div>');
    expect(findDueUniversal(d, now)).toEqual({ title: 'Homework 7', dueAt: local(2026, 11, 10), evidence: 'Due Date: 11/10/2026 11:59 PM' });
  });

  it('reads an InQuizitive-style page with a zone', () => {
    const d = page('<h1>Ch 5: Culture</h1><p>Due: November 10, 2026, 11:59 PM EST</p>');
    expect(findDueUniversal(d, now)?.dueAt).toBe('2026-11-11T04:59:00.000Z');
  });

  it('prefers Due over Available until', () => {
    const d = page('<h1>HW 4</h1><p>Due Nov 10 11:59 PM</p><p>Available until Nov 13 11:59 PM</p>');
    expect(findDueUniversal(d, now)?.dueAt).toBe(local(2026, 11, 10));
  });

  it('returns nothing on a list page with different due dates', () => {
    const d = page('<h1>Assignments</h1><table><tr><td>HW 1</td><td>Due Nov 3</td></tr><tr><td>HW 2</td><td>Due Nov 10</td></tr><tr><td>HW 3</td><td>Due Nov 17</td></tr></table>');
    expect(findDueUniversal(d, now)).toBeNull();
  });

  it('accepts the same date shown twice', () => {
    const d = page('<header>Due Nov 10 11:59 PM</header><h1>Lab 3</h1><aside>Due: Nov 10 at 11:59 PM</aside>');
    expect(findDueUniversal(d, now)?.dueAt).toBe(local(2026, 11, 10));
  });

  it('ignores hidden text', () => {
    const d = page('<h1>HW 5</h1><div hidden>Due Nov 1</div><div aria-hidden="true">Due Nov 2</div><script>var x = "Due Nov 3"</script>');
    expect(findDueUniversal(d, now)).toBeNull();
  });

  it('returns nothing without a date', () => {
    expect(findDueUniversal(page('<h1>Welcome</h1><p>Your work is due soon.</p>'), now)).toBeNull();
  });

  it('falls back to the document title when there is no heading', () => {
    expect(findDueUniversal(page('<p>Due Nov 12</p>', 'Quiz 3 - Top Hat'), now)?.title).toBe('Quiz 3 - Top Hat');
  });
});

describe('findDue', () => {
  it('uses the WileyPLUS finder for wileyplus', () => {
    const d = page('<main><h1>PHYS 172H - HW11 - FA26</h1><span>Due Monday, Nov 9 at 11:59 PM (EST)</span></main>');
    expect(findDueWiley(d, now)).toEqual({ title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due Monday, Nov 9 at 11:59 PM (EST)' });
    expect(findDue(d, now, 'wileyplus')?.dueAt).toBe('2026-11-10T04:59:00.000Z');
  });

  it('falls back to the universal finder when the dedicated one finds nothing', () => {
    const d = page('<div role="heading">HW 12</div><p>Deadline: Nov 20, 5:00 PM</p>');
    expect(findDue(d, now, 'wileyplus')).toEqual({ title: 'HW 12', dueAt: local(2026, 11, 20, 17, 0), evidence: 'Deadline: Nov 20, 5:00 PM' });
  });

  it('uses the universal finder for unknown platforms', () => {
    expect(findDue(page('<h1>A1</h1><p>Due Nov 12</p>'), now)?.title).toBe('A1');
  });
});

describe('pageLines', () => {
  it('joins table cells with " | " and keeps blocks as lines', () => {
    const d = page('<h1>Schedule</h1><table><tr><td>Week 7</td><td>Oct 14</td><td>Exam 2</td></tr></table><p>Office hours <b>Mon</b> 3pm</p>');
    expect(pageLines(d)).toEqual(['Schedule', 'Week 7 | Oct 14 | Exam 2', 'Office hours Mon 3pm']);
  });
});

describe('findDueUniversal on block layouts', () => {
  it('joins a label and its value laid out as separate blocks', () => {
    const d = page('<h1>Quiz 2</h1><div class="row"><div class="k">Due:</div><div class="v">Nov 10, 2026 11:59 PM</div></div>');
    expect(findDueUniversal(d, now)?.dueAt).toBe(local(2026, 11, 10));
  });
});
