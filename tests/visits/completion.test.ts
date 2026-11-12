import { describe, it, expect } from 'vitest';
import { findCompletion } from '../../src/visits/finders/completion';

const now = new Date('2026-11-12T12:00:00Z');
const page = (html: string) => {
  document.body.innerHTML = html;
  return document;
};

describe('findCompletion', () => {
  it('"Score: 18/25" is done by score', () => {
    const a = findCompletion(page('<h1>HW 3</h1><div>Score: 18/25</div>'), 'WileyPLUS', now);
    expect(a).toMatchObject({ state: 'done', by: 'score', source: 'WileyPLUS', score: { text: '18/25', earned: 18, possible: 25 } });
  });

  it('a short "Submitted" badge is done by submitted', () => {
    expect(findCompletion(page('<h1>HW 3</h1><span class="badge">Submitted</span><p>Due Nov 2</p>'), 'WileyPLUS', now)).toEqual({ state: 'done', by: 'submitted', source: 'WileyPLUS', evidence: 'Submitted' });
    expect(findCompletion(page('<h1>HW 3</h1><div>Status: Completed</div>'), 'ALEKS', now)).toMatchObject({ state: 'done', by: 'submitted', evidence: 'Status: Completed' });
  });

  it('"Not submitted" as its own element is not_done', () => {
    expect(findCompletion(page('<h1>HW 3</h1><span>Not submitted</span>'), 'WileyPLUS', now)).toEqual({ state: 'not_done', source: 'WileyPLUS', evidence: 'Not submitted' });
    expect(findCompletion(page('<h1>HW 3</h1><div>Status: Not started</div>'), 'WileyPLUS', now)).toMatchObject({ state: 'not_done' });
  });

  it('"will be graded" in a sentence, a bare "18/25", and a list of assignments give null', () => {
    expect(findCompletion(page('<p>Your answers will be graded after the due date and submitted work is final.</p>'), 'X', now)).toBeNull();
    expect(findCompletion(page('<h1>HW 3</h1><span>18/25</span>'), 'X', now)).toBeNull();
    expect(findCompletion(page('<ul><li><span>HW 1</span><span>Submitted</span></li><li><span>HW 2</span><span>Not started</span></li></ul>'), 'X', now)).toBeNull();
    expect(findCompletion(page('<ul><li>HW 1 <b>Submitted</b></li><li>HW 2 <b>Submitted</b></li><li>HW 3 <b>Submitted</b></li></ul>'), 'X', now)).toBeNull();
  });

  it('a zero score next to "Not submitted" is not_done; a zero score alone is no answer; a positive score is done', () => {
    expect(findCompletion(page('<span>Not submitted</span><div>Score: 0/25</div>'), 'X', now)).toMatchObject({ state: 'not_done' });
    expect(findCompletion(page('<h1>HW 3</h1><div>Score: 0/25</div>'), 'X', now)).toBeNull();
    expect(findCompletion(page('<span>Submitted</span><div>Score: 0/25</div>'), 'X', now)).toMatchObject({ state: 'done', by: 'score' });
    expect(findCompletion(page('<h1>HW 3</h1><div>Score: 7/25</div>'), 'X', now)).toMatchObject({ state: 'done', by: 'score' });
  });

  it('hidden elements are ignored', () => {
    expect(findCompletion(page('<span hidden>Submitted</span><h1>HW 3</h1>'), 'X', now)).toBeNull();
  });

  it('status words in tabs, links, buttons, menus, navigation or table headers say nothing (filters and lists, not this work)', () => {
    for (const html of [
      '<h1>HW 7</h1><div role="tablist"><span role="tab">Upcoming</span><span role="tab">Completed</span></div>',
      '<h1>HW 7</h1><nav><span>Completed</span></nav>',
      '<h1>HW 7</h1><a href="/done">Completed</a>',
      '<h1>HW 7</h1><button>Submitted</button>',
      '<h1>HW 7</h1><table><tr><th>Graded</th></tr><tr><td>Problem 1</td></tr></table>',
      '<h1>HW 7</h1><select><option>Not started</option></select>',
    ]) {
      document.body.innerHTML = html;
      expect(findCompletion(document, 'ALEKS', now), html).toBeNull();
    }
  });

  it('"Complete" (often a button or an instruction) is not a status', () => {
    document.body.innerHTML = '<h1>HW 7</h1><p><span>Complete</span></p>';
    expect(findCompletion(document, 'ALEKS', now)).toBeNull();
  });

  it('a hidden child does not make a status out of its parent', () => {
    document.body.innerHTML = '<h1>HW 7</h1><p><span>Submitted</span><span hidden> late by 3 days, not accepted</span></p>';
    expect(findCompletion(document, 'ALEKS', now)).toMatchObject({ state: 'done', by: 'submitted' });
    document.body.innerHTML = '<h1>HW 7</h1><div><span hidden>Submitted</span></div>';
    expect(findCompletion(document, 'ALEKS', now)).toBeNull();
  });
});
