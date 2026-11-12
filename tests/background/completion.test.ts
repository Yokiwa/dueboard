import { describe, it, expect } from 'vitest';
import { foldSnapshots, recordCompletion } from '../../src/background/completion';
import { migrate } from '../../src/storage/store';
import type { CompletionRecord, RawItem, StoreShape } from '../../src/core/types';

const now = new Date('2026-11-12T12:00:00Z');
const item = (source: RawItem['source'], id: string, p: Partial<RawItem> = {}): RawItem => ({ source, sourceItemId: id, sourceCourseId: '1', title: id, type: 'assignment', dueAt: null, url: 'u', submitted: false, ...p });
const snap = (items: RawItem[]) => ({ syncedAt: now.toISOString(), courses: [], items, links: [], partial: [] });

describe('foldSnapshots', () => {
  it('every raw item with an answer gets a record under "<source>:<sourceItemId>"; items without one are left alone', () => {
    const before: Record<string, CompletionRecord> = { 'brightspace:quiz:3': { state: 'unknown', checkedAt: 'x', tries: 1 } };
    const out = foldSnapshots(before, {
      brightspace: snap([item('brightspace', 'dropbox:1', { submitted: true, submissionKnown: true }), item('brightspace', 'quiz:3'), item('brightspace', 'dropbox:2', { submissionKnown: true })]),
      gradescope: snap([item('gradescope', '9', { score: { text: '18/20', from: 'Gradescope' }, submitted: true, submissionKnown: true })]),
    }, now);
    expect(out['brightspace:dropbox:1']).toEqual({ state: 'done', by: 'submitted', source: 'Brightspace', checkedAt: now.toISOString() });
    expect(out['brightspace:dropbox:2']).toEqual({ state: 'not_done', source: 'Brightspace', checkedAt: now.toISOString() });
    expect(out['gradescope:9']).toMatchObject({ state: 'done', by: 'score', source: 'Gradescope', score: { text: '18/20' } });
    expect(out['brightspace:quiz:3']).toBe(before['brightspace:quiz:3']);
  });

  it('a Pearson row marked submitted because it closed is not an answer', () => {
    const out = foldSnapshots({}, { pearson: snap([item('pearson', '100', { submitted: true })]) }, now);
    expect(out['pearson:100']).toBeUndefined();
  });
});

describe('recordCompletion', () => {
  it('folds the stored snapshots into the stored records and saves only completion', async () => {
    let store: StoreShape = migrate({ snapshots: { brightspace: snap([item('brightspace', 'dropbox:1', { submitted: true, submissionKnown: true })]) } });
    const saves: Partial<StoreShape>[] = [];
    await recordCompletion(async () => store, async (p) => void (saves.push(p), (store = { ...store, ...p })), now);
    expect(saves).toEqual([{ completion: { 'brightspace:dropbox:1': { state: 'done', by: 'submitted', source: 'Brightspace', checkedAt: now.toISOString() } } }]);
  });
});
