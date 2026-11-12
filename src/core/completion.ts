import type { CheckAnswer, CompletionRecord, RawItem, Score, UserState } from './types';

/**
 * Whether work was handed in: what a source says (answerOf), how answers add up over syncs (foldAnswer), and an
 * item's state from all its sources and the student's own choices (itemState). Pure. See the 1.5.0 design, section 3.
 */

/** What a raw item from a source says, or null when it says nothing (a "submitted: false" that was never asked). */
export function answerOf(raw: RawItem, source: string): CheckAnswer | null {
  if (raw.score) return { state: 'done', by: 'score', source, score: raw.score };
  if (!raw.submissionKnown) return null;
  return raw.submitted ? { state: 'done', by: 'submitted', source } : { state: 'not_done', source };
}

/**
 * A record after one more answer. A page check that found nothing (`page`) counts a try; a source that said nothing
 * changes nothing. Done is kept against a later "not done" (a score proves the work was taken), and keeps its score when
 * a later "done" has none.
 */
export function foldAnswer(prev: CompletionRecord | undefined, answer: CheckAnswer | null, now: Date, opts: { page?: boolean } = {}): CompletionRecord | undefined {
  const at = now.toISOString();
  if (!answer) {
    if (!opts.page) return prev;
    return { ...(prev ?? { state: 'unknown' }), checkedAt: at, tries: (prev?.tries ?? 0) + 1 };
  }
  if (answer.state === 'not_done') {
    if (prev?.state === 'done') return { ...prev, checkedAt: at };
    const r: CompletionRecord = { state: 'not_done', source: answer.source, evidence: answer.evidence, checkedAt: at };
    return clean(r);
  }
  const score = answer.score ?? (prev?.state === 'done' ? prev.score : undefined);
  const by = answer.score ? 'score' : prev?.state === 'done' && prev.score ? prev.by : answer.by;
  const source = answer.score || !(prev?.state === 'done' && prev.score) ? answer.source : prev.source;
  const evidence = answer.score || !(prev?.state === 'done' && prev.score) ? answer.evidence : prev.evidence;
  const r: CompletionRecord = { state: 'done', by, source, score, evidence, checkedAt: at };
  return clean(r);
}

export interface ItemCompletion {
  done: boolean;
  /** Why it is done; absent when not. */
  doneBy?: { by: 'submitted' | 'score' | 'user'; source?: string };
  score?: Score;
  /** What the sources say, after the student's choices. */
  known: 'done' | 'not_done' | 'unknown';
}

/** An item's state from all its keys: the student's choices first, then any done, then any not_done. */
export function itemState(keys: string[], completion: Record<string, CompletionRecord>, user: Pick<UserState, 'done' | 'notDone'>): ItemCompletion {
  if (keys.some((k) => user.notDone?.[k])) return { done: false, known: 'not_done' };
  const records = keys.map((k) => completion[k]).filter((r): r is CompletionRecord => r !== undefined);
  const done = records.filter((r) => r.state === 'done');
  const scored = done.find((r) => r.score);
  if (keys.some((k) => user.done[k])) {
    const out: ItemCompletion = { done: true, known: done.length ? 'done' : records.some((r) => r.state === 'not_done') ? 'not_done' : 'unknown', doneBy: { by: 'user' } };
    if (scored) out.score = scored.score;
    return out;
  }
  if (done.length) {
    const r = scored ?? done[0]!;
    const out: ItemCompletion = { done: true, known: 'done', doneBy: clean({ by: r.by ?? 'submitted', source: r.source }) };
    if (scored) out.score = scored.score;
    return out;
  }
  return { done: false, known: records.some((r) => r.state === 'not_done') ? 'not_done' : 'unknown' };
}

/** Drops undefined fields, so records stay small and compare cleanly. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
