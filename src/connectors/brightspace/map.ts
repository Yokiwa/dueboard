import { extractCourseCode } from '../../core/courseCode';
import type { RawCourse, RawItem, RawLink } from '../../core/types';
import type { CalendarEvent, DropboxFolder, Enrollment, Quiz, Toc, TocModule } from './api';

const DAY = 86_400_000;

/** Active, accessible courses that have not ended more than a week ago and start within 30 days. */
export function isCurrent(e: Enrollment, now: Date): boolean {
  const { IsActive, CanAccess, StartDate, EndDate } = e.Access;
  if (!IsActive || !CanAccess) return false;
  if (EndDate && Date.parse(EndDate) < now.getTime() - 7 * DAY) return false;
  if (StartDate && Date.parse(StartDate) > now.getTime() + 30 * DAY) return false;
  return true;
}

export function toCourse(e: Enrollment, base: string): RawCourse {
  const id = String(e.OrgUnit.Id);
  return {
    source: 'brightspace',
    sourceCourseId: id,
    name: e.OrgUnit.Name,
    code: extractCourseCode(e.OrgUnit.Name) ?? (e.OrgUnit.Code ? extractCourseCode(e.OrgUnit.Code.replace(/-/g, ' ')) : null),
    url: `${base}/d2l/home/${id}`,
  };
}

/** Due date, or the close date when the instructor set only that. */
export function folderDue(f: DropboxFolder): string | null {
  return f.DueDate ?? f.Availability?.EndDate ?? null;
}

export function toDropboxItem(f: DropboxFolder, ou: string, base: string, submitted: boolean): RawItem {
  return {
    source: 'brightspace',
    sourceItemId: `dropbox:${f.Id}`,
    sourceCourseId: ou,
    title: f.Name,
    type: 'assignment',
    dueAt: folderDue(f),
    url: `${base}/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=${ou}&db=${f.Id}`,
    submitted,
  };
}

export function toQuizItem(q: Quiz, ou: string, base: string): RawItem {
  return {
    source: 'brightspace',
    sourceItemId: `quiz:${q.QuizId}`,
    sourceCourseId: ou,
    title: q.Name,
    type: 'quiz',
    dueAt: q.DueDate ?? q.EndDate ?? null,
    url: `${base}/d2l/lms/quizzing/user/quiz_summary.d2l?ou=${ou}&qi=${q.QuizId}`,
    submitted: false,
  };
}

// Whole words only: "lab" must not match "Syllabus"/"Collaborate", "exam" must not match "Example".
const DEADLINE_WORDS = /\b(due|hw\d*|homework|assignment|quiz|exam|midterm|final|project|essay|report|paper|webassign|connect|mastering|mylab|zybooks?)\b/i;
const EXAM_WORDS = /\b(exam|midterm|final)\b/i;
const DUPLICATE_ENTITY = /dropbox|quiz/i;

/** Absolute http(s) URL, or null for anything else (relative paths resolve against Brightspace). */
function webUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Where "Open" goes for a calendar event: the linked activity (e.g. a content topic with a due date),
 * else the event's own page as Brightspace reports it, else the course calendar. Never a hand-built
 * event URL — Purdue's Brightspace answers those with HTTP 500.
 */
function eventUrl(ev: CalendarEvent, ou: string, base: string): string {
  return webUrl(ev.AssociatedEntity?.Link, base) ?? webUrl(ev.CalendarEventViewUrl, base) ?? `${base}/d2l/le/calendar/${ou}`;
}

/**
 * Calendar events become items only when they look like a deadline: events tied to an assignment or
 * quiz are skipped (we already read those), and plain events need a deadline-like word in the title.
 */
export function toEventItem(ev: CalendarEvent, base: string): RawItem | null {
  if (ev.AssociatedEntity && DUPLICATE_ENTITY.test(ev.AssociatedEntity.AssociatedEntityType)) return null;
  if (!ev.AssociatedEntity && !DEADLINE_WORDS.test(ev.Title)) return null;
  const ou = String(ev.OrgUnitId);
  return {
    source: 'brightspace',
    sourceItemId: `event:${ev.CalendarEventId}`,
    sourceCourseId: ou,
    title: ev.Title,
    type: EXAM_WORDS.test(ev.Title) ? 'exam' : 'event',
    dueAt: ev.EndDateTime ?? ev.StartDateTime ?? null,
    url: eventUrl(ev, ou, base),
    submitted: false,
  };
}

export function tocLinks(toc: Toc, ou: string, base = 'https://purdue.brightspace.com'): RawLink[] {
  const out: RawLink[] = [];
  const walk = (m: TocModule) => {
    for (const t of m.Topics ?? []) {
      // Topics without a Url (some LTI tools) still open through their content page.
      const url = t.Url || (t.TopicId !== undefined ? `${base}/d2l/le/content/${ou}/viewContent/${t.TopicId}/View` : null);
      if (url) out.push({ source: 'brightspace', sourceCourseId: ou, title: t.Title, url });
    }
    for (const child of m.Modules ?? []) walk(child);
  };
  for (const m of toc.Modules ?? []) walk(m);
  return out;
}
