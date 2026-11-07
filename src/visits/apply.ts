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

  for (const o of outcomes) {
    const target = byKey.get(o.key);
    if (target?.mode === 'syllabus') {
      const ou = o.key.slice('syllabus:'.length);
      const src = { ou, kind: 'visit' as const, url: target.launchUrl, title: target.title, modified: null };
      const course = store.snapshots.brightspace?.courses.find((c) => c.sourceCourseId === ou) ?? {};
      if (o.status === 'text') syllabus[ou] = syllabusFromLines(src, o.lines, courseTerm(course, now), now);
      else if (o.status !== 'signed_out') syllabus[ou] = { ...syllabusFromLines(src, [], courseTerm(course, now), now), rows: store.syllabus[ou]?.rows ?? [] };
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
        break;
      case 'none':
        captured[o.key] = { ...base, platform: platformOf(o.host), misses: (prev?.misses ?? 0) + 1, failures: 0 };
        delete captured[o.key]!.blocked;
        break;
      case 'failed':
        captured[o.key] = { ...base, failures: (prev?.failures ?? 0) + 1 };
        break;
      case 'needs_permission':
        captured[o.key] = { ...base, platform: platformOf(o.host), blocked: o.host };
        if (!needsPermission.includes(o.host)) needsPermission.push(o.host);
        break;
      default:
        break;
    }
  }
  return { captured, syllabus, visitState: { ...store.visitState, needsPermission, lastRun: at } };
}
