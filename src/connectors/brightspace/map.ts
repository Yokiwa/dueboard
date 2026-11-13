import { extractCourseCode, normalizeTitle } from '../../core/courseCode';
import { formatPoints } from '../../core/scoreText';
import type { RawCourse, RawItem, RawLink, RawMeeting, Score } from '../../core/types';
import type { CalendarEvent, DropboxFolder, Enrollment, GradeValue, Quiz, Toc, TocModule } from './api';

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
    start: e.Access.StartDate,
    end: e.Access.EndDate,
  };
}

/** Due date, or the close date when the instructor set only that. */
export function folderDue(f: DropboxFolder): string | null {
  return f.DueDate ?? f.Availability?.EndDate ?? null;
}

/** `submitted`: the answer to "did I submit?", or null when the folder was not asked (or the request failed). */
export function toDropboxItem(f: DropboxFolder, ou: string, base: string, submitted: boolean | null): RawItem {
  const item: RawItem = {
    source: 'brightspace',
    sourceItemId: `dropbox:${f.Id}`,
    sourceCourseId: ou,
    title: f.Name,
    type: 'assignment',
    dueAt: folderDue(f),
    url: `${base}/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=${ou}&db=${f.Id}`,
    submitted: submitted === true,
  };
  if (submitted !== null) item.submissionKnown = true;
  return item;
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
/** Titles that name a class meeting ("Lecture", "Lec21", "LEC 22", "Lect. 3", "Recitation", "Office hours"…). */
const MEETING_WORDS =
  /\b(lectures?|lect?|recitations?|office\s*hours?|class\s+(?:meeting|session)s?|discussion\s+sections?|seminars?|collaborate|sections?)\b|\blect?\.?\s*\d+/i;
/** Days without class: neither work nor a meeting. */
const DAYS_OFF = /\b(breaks?|holidays?|no\s+class(?:es)?)\b/i;
/** Work named next to a meeting word ("Lecture 5 Quiz"): the title is about the work. */
const WORK_WORDS = /\b(due|hw\d*|homework|assignments?|quiz(?:zes)?|projects?|essays?|reports?|papers?)\b/i;
/** An exam held in a class slot ("Lecture: Midterm Exam") is still an exam; "final" alone ("Final Review") is not. */
const EXAM_IN_CLASS = /\b(exams?|midterms?)\b/i;
const MIN = 60_000;
/** A meeting posted with a start only lasts a usual class period. */
const DEFAULT_MEETING_MS = 50 * MIN;
/**
 * Description wording that assigns work: a reading ("pg. 121-139", "Chapters 1-3", "Reading Questions") or something
 * to write and hand in. Humanities courses often post each reading as an event titled only after the text.
 */
const WORK_DESCRIPTION =
  /\b(read|reading|readings|write|respond|response|prompt|submit|due|assignment|homework|essay|worksheet)\b|\b(pages?|pg|pp|chapters?|ch|lines)\.?\s*\d/i;
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

/** A plain (unlinked) event's description, without HTML tags, asks for work. */
function describesWork(ev: CalendarEvent): boolean {
  if (MEETING_WORDS.test(ev.Title) || DAYS_OFF.test(ev.Title)) return false;
  const text = (ev.Description ?? '').replace(/<[^>]*>/g, ' ');
  return WORK_DESCRIPTION.test(text);
}

/**
 * Calendar events become items only when they look like a deadline: events tied to an assignment or
 * quiz are skipped (we already read those), and plain events need a deadline-like word in the title,
 * or a description that assigns a reading or writing (class meetings and days off excepted).
 */
/** How long a timed event lasts, or null when it has no length (a deadline posted at one instant, no end). */
function lengthMs(ev: CalendarEvent): number | null {
  if (!ev.StartDateTime || !ev.EndDateTime) return null;
  const ms = Date.parse(ev.EndDateTime) - Date.parse(ev.StartDateTime);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Work (shown as a deadline), a class meeting (shown in the calendar only) or nothing. Events linked to an assignment
 * or quiz are dropped (read from their own source). A title naming a meeting is a meeting, linked or not, unless it
 * also names work or an exam. Other linked events are work. A plain timed event of class length with no deadline word
 * is a meeting too.
 */
export function classifyEvent(ev: CalendarEvent): 'work' | 'meeting' | 'drop' {
  if (ev.AssociatedEntity && DUPLICATE_ENTITY.test(ev.AssociatedEntity.AssociatedEntityType)) return 'drop';
  const title = ev.Title;
  if (DAYS_OFF.test(title)) return 'drop';
  // A meeting word decides for linked events too: a lecture is often linked to its slides in Content.
  if (MEETING_WORDS.test(title)) {
    if (WORK_WORDS.test(title) || EXAM_IN_CLASS.test(title)) return 'work';
    return ev.IsAllDayEvent || !ev.StartDateTime ? 'drop' : 'meeting';
  }
  if (ev.AssociatedEntity) return 'work';
  const ms = ev.IsAllDayEvent ? null : lengthMs(ev);
  if (ms !== null && ms >= 20 * MIN && ms <= 4 * 60 * MIN && !DEADLINE_WORDS.test(title)) return 'meeting';
  return DEADLINE_WORDS.test(title) || describesWork(ev) ? 'work' : 'drop';
}

/** A class meeting for the calendar, or null when the event is not one. */
export function toMeeting(ev: CalendarEvent, base: string): RawMeeting | null {
  if (classifyEvent(ev) !== 'meeting' || !ev.StartDateTime) return null;
  const ou = String(ev.OrgUnitId);
  const endAt = lengthMs(ev) !== null ? ev.EndDateTime! : new Date(Date.parse(ev.StartDateTime) + DEFAULT_MEETING_MS).toISOString();
  return { source: 'brightspace', sourceId: `event:${ev.CalendarEventId}`, sourceCourseId: ou, title: ev.Title, startAt: ev.StartDateTime, endAt, url: eventUrl(ev, ou, base) };
}

export function toEventItem(ev: CalendarEvent, base: string): RawItem | null {
  if (classifyEvent(ev) !== 'work') return null;
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

/** A kind of graded work followed by a number: "HW 3", "Problem Set 3", "Assignment 4", "Lab 5", "Project #2", "Worksheet 7". */
const WORK_NUMBERED = /\b(hw|homework|assignments?|problem\s*sets?|psets?|labs?|quiz(?:zes)?|projects?|worksheets?|exercises?)\s*[-_#:]?\s*\d+/i;
/** A unit then a kind of work: "Chapter 6 Quiz", "Week 3 Homework". */
const UNIT_THEN_WORK = /\b(chapter|ch\.?|week|wk|unit|module|lesson|section)\s*\d+\b.*\b(quiz|homework|hw|assignment|problem\s*set|worksheet|lab)\b/i;
/** Modules whose launches are all homework, whatever their titles. */
const WORK_MODULE = /\b(homework|hw|assignments?|problem\s*sets?)\b/i;
const NOT_WORK = /^copy of\b|study purposes|practice|solutions?\b|answer key|\bhome\b|\baccess\b|resources|registration|purchase|instructions|getting started|course tools?/i;
const LAUNCH = /\/lti\/|quickLink.*[?&]type=lti/i;

/**
 * Content topics that launch a homework platform become items, so homework that lives outside Brightspace still
 * shows up — whatever the platform. A launch counts when its title names numbered work ("Problem Set 3",
 * "Chapter 6 Quiz") or when it sits in a Homework / Assignments module. Platform home links, practice copies and
 * solutions don't count. Items open through their content page; the date is the topic's own due date when
 * Brightspace has one (otherwise a calendar event or a page capture with the same title supplies it).
 */
export function tocItems(toc: Toc, ou: string, base: string): RawItem[] {
  const out: RawItem[] = [];
  const walk = (m: TocModule, inWorkModule: boolean) => {
    const workHere = inWorkModule || WORK_MODULE.test(m.Title ?? '');
    for (const t of m.Topics ?? []) {
      if (t.TopicId === undefined || !t.Url || !LAUNCH.test(t.Url)) continue;
      if (NOT_WORK.test(t.Title)) continue;
      if (!workHere && !WORK_NUMBERED.test(t.Title) && !UNIT_THEN_WORK.test(t.Title)) continue;
      out.push({
        source: 'brightspace',
        sourceItemId: `topic:${t.TopicId}`,
        sourceCourseId: ou,
        title: t.Title,
        type: 'assignment',
        dueAt: t.DueDate ?? t.EndDateTime ?? null,
        url: `${base}/d2l/le/content/${ou}/viewContent/${t.TopicId}/View`,
        submitted: false,
        launchUrl: new URL(t.Url, base).href,
      });
    }
    for (const child of m.Modules ?? []) walk(child, workHere);
  };
  for (const m of toc.Modules ?? []) walk(m, false);
  return out;
}

function gradeScore(g: GradeValue): Score | null {
  const { PointsNumerator: n, PointsDenominator: d } = g;
  if (typeof n === 'number' && typeof d === 'number' && Number.isFinite(n) && Number.isFinite(d) && d > 0) {
    return { text: formatPoints(n, d), earned: n, possible: d, from: 'Brightspace' };
  }
  return displayedScore(g.DisplayedGrade?.trim() ?? '');
}

/** A displayed grade is used only as a percentage, a letter grade or "x / y"; "-" or free text gives no score. */
function displayedScore(shown: string): Score | null {
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(shown);
  if (pct) return { text: `${Number(Number(pct[1]).toFixed(2))}%`, from: 'Brightspace' };
  if (/^[A-F][+-]?$/.test(shown)) return { text: shown, from: 'Brightspace' };
  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(shown);
  if (frac && Number(frac[2]) > 0) {
    const earned = Number(frac[1]);
    const possible = Number(frac[2]);
    return { text: formatPoints(earned, possible), earned, possible, from: 'Brightspace' };
  }
  return null;
}

/**
 * Sets `score` on items of ONE course from its gradebook. A grade matches by grade item id first
 * (gradeIdOf: sourceItemId -> grade item id), else by normalized name when exactly one item and one
 * grade carry that name. Anything ambiguous gets no score.
 */
export function attachGrades(items: RawItem[], grades: GradeValue[], gradeIdOf: Map<string, string>): void {
  const idCount = new Map<string, number>();
  for (const g of grades) idCount.set(g.GradeObjectIdentifier, (idCount.get(g.GradeObjectIdentifier) ?? 0) + 1);

  // Pass 1: ids. An id-bearing item never falls back to its name; a claimed grade is not offered to name matching.
  const claimed = new Set<string>();
  for (const it of items) {
    const gid = gradeIdOf.get(it.sourceItemId);
    if (gid === undefined || idCount.get(gid) !== 1) continue;
    const match = grades.find((g) => g.GradeObjectIdentifier === gid);
    const score = match ? gradeScore(match) : null;
    if (score) it.score = score;
    claimed.add(gid);
  }

  // Pass 2: names, among unclaimed grades and items without a grade id.
  const nameCount = new Map<string, number>();
  for (const g of grades) {
    if (claimed.has(g.GradeObjectIdentifier)) continue;
    const k = normalizeTitle(g.GradeObjectName);
    if (k) nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
  }
  const itemCount = new Map<string, number>();
  for (const it of items) {
    const k = normalizeTitle(it.title);
    if (k) itemCount.set(k, (itemCount.get(k) ?? 0) + 1);
  }
  for (const it of items) {
    if (gradeIdOf.has(it.sourceItemId)) continue;
    const k = normalizeTitle(it.title);
    if (!k || itemCount.get(k) !== 1 || nameCount.get(k) !== 1) continue;
    const match = grades.find((g) => !claimed.has(g.GradeObjectIdentifier) && normalizeTitle(g.GradeObjectName) === k);
    const score = match ? gradeScore(match) : null;
    if (score) it.score = score;
  }
}
