import { extractCourseCode, normalizeTitle } from '../../core/courseCode';
import { formatPoints } from '../../core/scoreText';
import type { RawCourse, RawItem, Score } from '../../core/types';

export const GS_BASE = 'https://www.gradescope.com';

/** The page loaded but did not have the structure we expect (Gradescope may have changed its design). */
export class GradescopeParseError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'GradescopeParseError';
  }
}

/** Sync in pages and tests (DOMParser available); async when proxied to the offscreen document. */
export interface GradescopeParser {
  home(html: string): RawCourse[] | Promise<RawCourse[]>;
  course(html: string, courseId: string): RawItem[] | Promise<RawItem[]>;
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** "2026-11-04 23:59:00 -0500" → ISO string in UTC. */
export function parseGsDate(value: string | null): string | null {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}):?(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Student course lists only (headings mentioning "Instructor" are skipped), newest term only. */
function home(html: string): RawCourse[] {
  const doc = parse(html);
  const lists = [...doc.querySelectorAll('.courseList')];
  if (lists.length === 0) throw new GradescopeParseError('account page has no .courseList');
  const studentList = lists.find((list) => {
    let prev = list.previousElementSibling;
    while (prev && !prev.matches('h1, h2, .pageHeading')) prev = prev.previousElementSibling;
    return !/instructor/i.test(text(prev));
  });
  if (!studentList) return [];
  const firstTerm = studentList.querySelector('.courseList--coursesForTerm');
  const boxes = [...(firstTerm ?? studentList).querySelectorAll('a.courseBox')];
  const courses: RawCourse[] = [];
  for (const a of boxes) {
    const id = a.getAttribute('href')?.match(/^\/courses\/(\d+)/)?.[1];
    if (!id) continue;
    const short = text(a.querySelector('.courseBox--shortname'));
    const long = text(a.querySelector('.courseBox--name'));
    courses.push({
      source: 'gradescope',
      sourceCourseId: id,
      name: [short, long].filter(Boolean).join(' '),
      code: extractCourseCode(short) ?? extractCourseCode(long),
      url: `${GS_BASE}/courses/${id}`,
    });
  }
  return courses;
}

function course(html: string, courseId: string): RawItem[] {
  const doc = parse(html);
  const table = doc.querySelector('#assignments-student-table');
  if (!table) throw new GradescopeParseError(`course ${courseId} has no #assignments-student-table`);
  const items: RawItem[] = [];
  for (const row of table.querySelectorAll('tbody tr')) {
    const head = row.querySelector('th');
    const title = text(head);
    if (!title) continue;
    const link = head?.querySelector('a[href]');
    const href = link?.getAttribute('href') ?? null;
    const assignmentId =
      href?.match(/\/assignments\/(\d+)/)?.[1] ?? head?.querySelector('[data-assignment-id]')?.getAttribute('data-assignment-id') ?? null;
    const url = href
      ? new URL(href, GS_BASE).href
      : assignmentId
        ? `${GS_BASE}/courses/${courseId}/assignments/${assignmentId}`
        : `${GS_BASE}/courses/${courseId}`;
    const dueEl = [...row.querySelectorAll('time.submissionTimeChart--dueDate')].find((t) => !/^\s*late/i.test(t.textContent ?? ''));
    const status = row.querySelector('.submissionStatus');
    const scoreText = text(status?.querySelector('.submissionStatus--score'));
    const sm = scoreText.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    const earned = sm ? Number(sm[1]) : NaN;
    const possible = sm ? Number(sm[2]) : NaN;
    const score: Score | undefined =
      Number.isFinite(earned) && Number.isFinite(possible) && possible > 0
        ? { text: formatPoints(earned, possible), earned, possible, from: 'Gradescope', evidence: scoreText.slice(0, 120) }
        : undefined;
    // A score shows the work was taken, unless it is a zero: Gradescope also shows 0 for work never handed in.
    const scored = Boolean(status?.querySelector('.submissionStatus--score')) && earned !== 0;
    const submitted = scored || /submitted/i.test(text(status));
    // "Submitted", "No Submission" or a score: Gradescope answered whether the work was handed in.
    const answered = scored || /submitted|no submission/i.test(text(status));
    items.push({
      source: 'gradescope',
      sourceItemId: assignmentId ?? `title:${normalizeTitle(title)}`,
      sourceCourseId: courseId,
      title,
      type: 'assignment',
      dueAt: parseGsDate(dueEl?.getAttribute('datetime') ?? null),
      url,
      submitted: submitted && !/no submission/i.test(text(status)),
      ...(answered ? { submissionKnown: true } : {}),
      ...(score ? { score } : {}),
    });
  }
  return items;
}

export const domGradescopeParser = { home, course } satisfies GradescopeParser;
