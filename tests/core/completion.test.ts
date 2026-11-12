import { describe, it, expect } from 'vitest';
import { answerOf, foldAnswer, itemState } from '../../src/core/completion';
import type { CompletionRecord, RawItem, Score, UserState } from '../../src/core/types';

const now = new Date('2026-11-12T12:00:00Z');
const earlier = '2026-11-10T12:00:00.000Z';
const raw = (p: Partial<RawItem> = {}): RawItem => ({ source: 'gradescope', sourceItemId: '9', sourceCourseId: '1', title: 'HW 1', type: 'assignment', dueAt: null, url: 'u', submitted: false, ...p });
const score: Score = { text: '18/25', earned: 18, possible: 25, from: 'Gradescope' };
const user = (p: Partial<UserState> = {}): UserState => ({ done: {}, notDone: {}, colors: {}, hidden: {}, shown: {}, merges: {}, syllabusHidden: {}, ...p });

describe('answerOf', () => {
  it('a score means done by score', () => {
    expect(answerOf(raw({ score, submitted: true }), 'Gradescope')).toEqual({ state: 'done', by: 'score', source: 'Gradescope', score });
  });
  it('a zero score alone proves nothing (platforms give 0 for missing work); with a known submission it is done', () => {
    const zero: Score = { text: '0/25', earned: 0, possible: 25, from: 'Brightspace' };
    expect(answerOf(raw({ score: zero }), 'Brightspace')).toBeNull();
    expect(answerOf(raw({ score: { text: '0%', from: 'Pearson' } }), 'Pearson')).toBeNull();
    expect(answerOf(raw({ score: zero, submitted: false, submissionKnown: true }), 'Brightspace')).toEqual({ state: 'not_done', source: 'Brightspace' });
    expect(answerOf(raw({ score: zero, submitted: true, submissionKnown: true }), 'Brightspace')).toEqual({ state: 'done', by: 'score', source: 'Brightspace', score: zero });
  });

  it('submitted and known means done by submitted; known and not submitted means not_done; unknown means null', () => {
    expect(answerOf(raw({ submitted: true, submissionKnown: true }), 'Brightspace')).toEqual({ state: 'done', by: 'submitted', source: 'Brightspace' });
    expect(answerOf(raw({ submitted: false, submissionKnown: true }), 'Brightspace')).toEqual({ state: 'not_done', source: 'Brightspace' });
    expect(answerOf(raw({ submitted: false }), 'Brightspace')).toBeNull();
    expect(answerOf(raw({ submitted: true }), 'Brightspace')).toBeNull();
  });
});

describe('foldAnswer', () => {
  it('done keeps an earlier score when the new answer has none', () => {
    const prev: CompletionRecord = { state: 'done', by: 'score', source: 'Gradescope', score, checkedAt: earlier };
    expect(foldAnswer(prev, { state: 'done', by: 'submitted', source: 'Gradescope' }, now)).toEqual({ state: 'done', by: 'score', source: 'Gradescope', score, checkedAt: now.toISOString() });
  });
  it('a newer score replaces an older one (a regrade)', () => {
    const prev: CompletionRecord = { state: 'done', by: 'score', source: 'Gradescope', score, checkedAt: earlier };
    const regrade: Score = { text: '20/25', earned: 20, possible: 25, from: 'Gradescope' };
    expect(foldAnswer(prev, { state: 'done', by: 'score', source: 'Gradescope', score: regrade }, now)?.score).toEqual(regrade);
  });
  it('a page check with no answer adds a try and keeps the state', () => {
    const prev: CompletionRecord = { state: 'unknown', checkedAt: earlier, tries: 1 };
    expect(foldAnswer(prev, null, now, { page: true })).toEqual({ state: 'unknown', checkedAt: now.toISOString(), tries: 2 });
    expect(foldAnswer(undefined, null, now, { page: true })).toEqual({ state: 'unknown', checkedAt: now.toISOString(), tries: 1 });
    expect(foldAnswer(prev, null, now)).toBe(prev);
    expect(foldAnswer(undefined, null, now)).toBeUndefined();
  });
  it('a later not_done replaces unknown; a later done replaces not_done; an answer resets the tries', () => {
    const unknown: CompletionRecord = { state: 'unknown', checkedAt: earlier, tries: 2 };
    const notDone = foldAnswer(unknown, { state: 'not_done', source: 'WileyPLUS', evidence: 'Not submitted' }, now);
    expect(notDone).toEqual({ state: 'not_done', source: 'WileyPLUS', evidence: 'Not submitted', checkedAt: now.toISOString() });
    expect(foldAnswer(notDone, { state: 'done', by: 'submitted', source: 'WileyPLUS', evidence: 'Submitted' }, now)).toEqual({ state: 'done', by: 'submitted', source: 'WileyPLUS', evidence: 'Submitted', checkedAt: now.toISOString() });
  });
  it('a not_done answer does not undo work already known done (a score proves the work was taken)', () => {
    const done: CompletionRecord = { state: 'done', by: 'score', source: 'Brightspace', score, checkedAt: earlier };
    expect(foldAnswer(done, { state: 'not_done', source: 'Brightspace' }, now)).toEqual({ ...done, checkedAt: now.toISOString() });
  });
});

describe('itemState', () => {
  const rec = (state: CompletionRecord['state'], p: Partial<CompletionRecord> = {}): CompletionRecord => ({ state, checkedAt: earlier, ...p });
  it('done from any source wins over not_done from another', () => {
    const s = itemState(['brightspace:topic:1', 'gradescope:9'], { 'brightspace:topic:1': rec('not_done', { source: 'Brightspace' }), 'gradescope:9': rec('done', { by: 'score', source: 'Gradescope', score }) }, user());
    expect(s).toEqual({ done: true, known: 'done', doneBy: { by: 'score', source: 'Gradescope' }, score });
  });
  it("the student's tick wins", () => {
    const s = itemState(['k'], { k: rec('not_done', { source: 'Brightspace' }) }, user({ done: { k: true } }));
    expect(s.done).toBe(true);
    expect(s.doneBy).toEqual({ by: 'user' });
  });
  it('notDone outlasts later answers', () => {
    const s = itemState(['k'], { k: rec('done', { by: 'score', source: 'Gradescope', score }) }, user({ notDone: { k: true } }));
    expect(s).toEqual({ done: false, known: 'not_done' });
  });
  it('nothing known is unknown', () => {
    expect(itemState(['k'], {}, user())).toEqual({ done: false, known: 'unknown' });
    expect(itemState(['k'], { k: rec('unknown', { tries: 2 }) }, user())).toEqual({ done: false, known: 'unknown' });
  });
});
