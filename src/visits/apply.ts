import { foldAnswer } from '../core/completion';
import { platformByHost, platformById } from '../core/platformRegistry';
import type { CapturedDue, CheckAnswer, StoreShape } from '../core/types';
import { courseTerm, syllabusFromLines } from '../syllabus/read';
import { syllabusSources } from '../syllabus/sources';
import type { VisitOutcome, VisitTarget } from './schedule';

/** Folds a visit run's outcomes into the captured dates and the visit state. Pure. */
export function applyOutcomes(
  store: StoreShape,
  targets: VisitTarget[],
  outcomes: VisitOutcome[],
  now: Date,
): Pick<StoreShape, 'captured' | 'visitState' | 'syllabus' | 'completion'> {
  const at = now.toISOString();
  const captured = { ...store.captured };
  const completion = { ...store.completion };
  /** A page's answer, named by the platform it was read on ("Score from ALEKS"), folded into the item's record. */
  const record = (key: string, check: CheckAnswer | null, host: string, platform?: string) => {
    const label = platformByHost(host)?.label ?? (platform ? platformById(platform)?.label : undefined) ?? host;
    const named: CheckAnswer | null = !check ? null : check.state === 'done' && check.score ? { ...check, source: label, score: { ...check.score, from: label } } : { ...check, source: label };
    const next = foldAnswer(completion[key], named, now, { page: true });
    if (next) completion[key] = next;
  };
  const syllabus = { ...store.syllabus };
  const needsPermission = [...store.visitState.needsPermission];
  const byKey = new Map(targets.map((t) => [t.key, t]));

  const sessions = { ...store.visitState.sessions };
  for (const o of outcomes) {
    const target = byKey.get(o.key);
    if (target?.mode === 'session') {
      // Landing is not yet success (re-reading the platform decides that); anything else is a failed attempt.
      const src = target.platform as 'gradescope' | 'pearson';
      sessions[src] = { ...sessions[src], at, failures: (sessions[src]?.failures ?? 0) + (o.status === 'landed' ? 0 : 1) };
      continue;
    }
    if (target?.mode === 'syllabus') {
      const ou = o.key.slice('syllabus:'.length);
      // The link's last-modified time is kept: a stored syllabus without it reads as "changed" on every sync.
      const known = syllabusSources(store).find((s) => s.ou === ou && s.url === target.launchUrl);
      const src = { ou, kind: 'visit' as const, url: target.launchUrl, title: target.title, modified: known?.modified ?? null };
      const course = store.snapshots.brightspace?.courses.find((c) => c.sourceCourseId === ou) ?? {};
      if (o.status === 'text') syllabus[ou] = syllabusFromLines(src, o.lines, courseTerm(course, now), now);
      else if (o.status !== 'signed_out') syllabus[ou] = { ...syllabusFromLines(src, [], courseTerm(course, now), now), rows: store.syllabus[ou]?.rows ?? [] };
      if (o.status === 'needs_permission' && !needsPermission.includes(o.host)) needsPermission.push(o.host);
      continue;
    }
    if (target?.mode === 'check') {
      // Only a page read in full counts as a try; a visit that never got there records nothing.
      if (o.status === 'checked') record(o.key, o.check, o.host, target.platform);
      if (o.status === 'needs_permission' && !needsPermission.includes(o.host)) needsPermission.push(o.host);
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
        if (o.check) record(o.key, o.check, o.host, target.platform);
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
  return { captured, syllabus, visitState, completion };
}

/**
 * After an update: forget which platforms the hidden frames could not read and how often signing back in failed, so the
 * new version tries the background again at once instead of keeping an old version's verdict for days.
 */
export function forgetVisitMemory(state: StoreShape['visitState']): StoreShape['visitState'] {
  return { ...state, sessions: {}, frame: {} };
}

/**
 * After an update: forget visits that found no date (misses, failures, blocks), so the new version reads those
 * homeworks again on the next sync instead of waiting out the old backoff. Found dates and page captures stay.
 */
export function forgetUnfoundVisits(captured: StoreShape['captured']): StoreShape['captured'] {
  return Object.fromEntries(Object.entries(captured).filter(([, c]) => !(c.via === 'visit' && !c.dueAt)));
}
