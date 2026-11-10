import { platformByHost } from '../core/platformRegistry';
import type { CapturedDue, StoreShape } from '../core/types';
import { courseTerm, syllabusFromLines } from '../syllabus/read';
import type { VisitOutcome, VisitTarget } from './schedule';

/** Folds a visit run's outcomes into the captured dates and the visit state. Pure. */
export function applyOutcomes(
  store: StoreShape,
  targets: VisitTarget[],
  outcomes: VisitOutcome[],
  now: Date,
): Pick<StoreShape, 'captured' | 'visitState' | 'syllabus'> {
  const at = now.toISOString();
  const captured = { ...store.captured };
  const syllabus = { ...store.syllabus };
  const needsPermission = [...store.visitState.needsPermission];
  const byKey = new Map(targets.map((t) => [t.key, t]));

  const sessions = { ...store.visitState.sessions };
  for (const o of outcomes) {
    const target = byKey.get(o.key);
    if (target?.mode === 'session') {
      // Landing is not yet success (re-reading the platform decides that); anything else is a failed attempt.
      const src = target.platform as 'gradescope' | 'pearson';
      sessions[src] = { at, failures: (sessions[src]?.failures ?? 0) + (o.status === 'landed' ? 0 : 1) };
      continue;
    }
    if (target?.mode === 'syllabus') {
      const ou = o.key.slice('syllabus:'.length);
      const src = { ou, kind: 'visit' as const, url: target.launchUrl, title: target.title, modified: null };
      const course = store.snapshots.brightspace?.courses.find((c) => c.sourceCourseId === ou) ?? {};
      if (o.status === 'text') syllabus[ou] = syllabusFromLines(src, o.lines, courseTerm(course, now), now);
      else if (o.status !== 'signed_out') syllabus[ou] = { ...syllabusFromLines(src, [], courseTerm(course, now), now), rows: store.syllabus[ou]?.rows ?? [] };
      if (o.status === 'needs_permission' && !needsPermission.includes(o.host)) needsPermission.push(o.host);
      continue;
    }
    if (target?.mode === 'score') {
      if (o.status === 'score' && o.score) {
        const score = { ...o.score, from: platformByHost(o.host)?.label ?? o.host };
        const prevC = captured[o.key];
        captured[o.key] = prevC
          ? { ...prevC, score, scoreCheckedAt: at }
          : { itemKey: o.key, title: target.title, dueAt: null, platform: platformByHost(o.host)?.id ?? o.host, via: 'visit', checkedAt: at, score, scoreCheckedAt: at };
      } else if (o.status === 'needs_permission' && !needsPermission.includes(o.host)) needsPermission.push(o.host);
      continue;
    }
    if (!target || target.mode !== 'due') continue;
    const prev = captured[o.key];
    const base: CapturedDue = prev
      ? { ...prev }
      : { itemKey: o.key, title: target.title, dueAt: null, platform: target.platform ?? 'unknown', via: 'visit', checkedAt: at };
    base.itemKey = o.key;
    base.via = 'visit';
    base.checkedAt = at;
    const platformOf = (host: string) => platformByHost(host)?.id ?? host;
    switch (o.status) {
      case 'found':
        captured[o.key] = { ...base, title: o.found.title || target.title, dueAt: o.found.dueAt, platform: platformOf(o.host), evidence: o.found.evidence, misses: 0, failures: 0 };
        delete captured[o.key]!.blocked;
        break;
      case 'none':
        captured[o.key] = { ...base, platform: platformOf(o.host), misses: (prev?.misses ?? 0) + 1, failures: 0 };
        delete captured[o.key]!.blocked;
        break;
      case 'failed':
        captured[o.key] = { ...base, failures: (prev?.failures ?? 0) + 1 };
        delete captured[o.key]!.blocked;
        break;
      case 'needs_permission':
        captured[o.key] = { ...base, platform: platformOf(o.host), blocked: o.host };
        if (!needsPermission.includes(o.host)) needsPermission.push(o.host);
        break;
      default:
        break;
    }
  }
  const visitState = { ...store.visitState, needsPermission, lastRun: at };
  if (Object.keys(sessions).length) visitState.sessions = sessions;
  return { captured, syllabus, visitState };
}

/**
 * After an update: forget visits that found no date (misses, failures, blocks), so the new version reads those
 * homeworks again on the next sync instead of waiting out the old backoff. Found dates and page captures stay.
 * Also drops score-only entries (no date, no counters); the score is re-read on the next Refresh.
 */
export function forgetUnfoundVisits(captured: StoreShape['captured']): StoreShape['captured'] {
  return Object.fromEntries(Object.entries(captured).filter(([, c]) => !(c.via === 'visit' && !c.dueAt)));
}
