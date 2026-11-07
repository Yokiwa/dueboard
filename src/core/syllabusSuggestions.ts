import { normalizeTitle } from './courseCode';
import type { Dashboard } from './dashboard';
import type { CourseSyllabus, StoreShape } from './types';

export interface Suggestion {
  key: string;
  courseId: string;
  title: string;
  dueAt: string;
  allDay: boolean;
  excerpt: string;
  /** "Syllabus PDF", "Syllabus page", "Simple Syllabus" */
  source: string;
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
function similar(a: string, b: string): boolean {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size) >= 0.5;
}
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

function sourceLabel(s: CourseSyllabus): string {
  if (s.kind === 'pdf') return 'Syllabus PDF';
  if (s.kind === 'html') return 'Syllabus page';
  return /simplesyllabus\.com/i.test(s.source) ? 'Simple Syllabus' : 'Syllabus';
}

/**
 * Dated work found in syllabi that DueBoard doesn't already know: not past, not hidden, and not matching an item in
 * the same course on the same day. Suggestions only — they never count as deadlines until the student adds them.
 */
export function syllabusSuggestions(store: StoreShape, dash: Dashboard, now: Date): Suggestion[] {
  if (!store.settings.syllabus) return [];
  const out: Suggestion[] = [];
  for (const [ou, syl] of Object.entries(store.syllabus)) {
    const course = dash.courses.find((c) => c.sources.brightspace === ou);
    if (!course) continue;
    const items = dash.items.filter((i) => i.courseId === course.id && i.dueAt);
    for (const r of syl.rows) {
      if (Date.parse(r.dueAt) < now.getTime() - 86_400_000) continue;
      const key = `${ou}|${normalizeTitle(r.title)}|${r.dueAt.slice(0, 10)}`;
      if (store.userState.syllabusHidden[key]) continue;
      if (items.some((i) => sameDay(i.dueAt!, r.dueAt) && similar(i.title, r.title))) continue;
      out.push({ key, courseId: course.id, title: r.title, dueAt: r.dueAt, allDay: r.allDay, excerpt: r.excerpt, source: sourceLabel(syl) });
    }
  }
  return out.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

/** Courses (dashboard ids) whose syllabus was found but couldn't be read. */
export function unreadableSyllabi(store: StoreShape, dash: Dashboard): string[] {
  return Object.entries(store.syllabus)
    .filter(([, s]) => s.error === 'unreadable')
    .flatMap(([ou]) => dash.courses.filter((c) => c.sources.brightspace === ou).map((c) => c.id));
}
