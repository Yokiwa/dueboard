import { foldSnapshots, itemState, termStart as courseStart } from './completion';
import { platformById } from './platformRegistry';
import { findDueMatches } from './dueText';
import { extractCourseCode, normalizeTitle, stripDueSuffix } from './courseCode';
import { classifyLink } from './links';
import type {
  Course,
  CourseLink,
  Item,
  ItemType,
  ManualItem,
  RawCourse,
  RawItem,
  SourceId,
  StoreShape,
  UserState,
} from './types';

export const PALETTE = ['#2563EB', '#EA580C', '#059669', '#7C3AED', '#0891B2', '#CA8A04', '#DB2777', '#4F46E5'];
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MERGE_MS = 60 * 60 * 1000;
const TYPE_RANK: Record<ItemType, number> = { assignment: 4, quiz: 3, exam: 2, event: 1, manual: 0 };

export interface DashboardInput {
  snapshots: StoreShape['snapshots'];
  manualItems: ManualItem[];
  manualLinks: CourseLink[];
  userState: UserState;
  /** Due dates read on platform pages (visits, or pages the student opened). */
  captured?: StoreShape['captured'];
  /** Whether each item was handed in, as learned over syncs (1.5.0). */
  completion?: StoreShape['completion'];
}
export interface Dashboard {
  courses: Course[];
  items: Item[];
  links: CourseLink[];
  nextDue: Item | null;
}

const courseId = (source: SourceId, id: string) => `${source}:${id}`;
const dueMs = (i: { dueAt: string | null }) => (i.dueAt ? Date.parse(i.dueAt) : Number.POSITIVE_INFINITY);

function buildCourses(input: DashboardInput) {
  const { snapshots, userState } = input;
  const byId = new Map<string, Course>();
  /** "<source>:<sourceCourseId>" → Course.id it was folded into */
  const alias = new Map<string, string>();
  /** Course.id → that course's page on Gradescope */
  const gsUrl = new Map<string, string>();
  const codeOf = (c: RawCourse) => c.code ?? extractCourseCode(c.name);

  // Lecture + recitation offerings share a course code: one card, keyed by the LEC offering when there is one.
  const bsCourses = [...(snapshots.brightspace?.courses ?? [])].sort(
    (a, b) => Number(/\bLEC\b/.test(b.name)) - Number(/\bLEC\b/.test(a.name)),
  );
  const primaryByCode = new Map<string, string>();
  for (const c of bsCourses) {
    const id = courseId('brightspace', c.sourceCourseId);
    const code = codeOf(c);
    const primary = code ? primaryByCode.get(code) : undefined;
    if (primary) {
      alias.set(id, primary);
      byId.get(primary)!.partial ||= snapshots.brightspace?.partial.includes(c.sourceCourseId) ?? false;
      continue;
    }
    if (code) primaryByCode.set(code, id);
    const partial = snapshots.brightspace?.partial.includes(c.sourceCourseId) ?? false;
    byId.set(id, { id, code: codeOf(c) ?? c.name, name: c.name, sources: { brightspace: c.sourceCourseId }, color: '', hidden: false, url: c.url, partial, isCourse: codeOf(c) !== null });
    alias.set(id, id);
  }
  for (const c of snapshots.gradescope?.courses ?? []) {
    const key = courseId('gradescope', c.sourceCourseId);
    const code = codeOf(c);
    const forced = userState.merges[key];
    const target =
      (forced && byId.get(forced)) ||
      (code ? [...byId.values()].find((b) => b.sources.brightspace && b.code === code) : undefined);
    const partial = snapshots.gradescope?.partial.includes(c.sourceCourseId) ?? false;
    if (target) {
      target.sources.gradescope = c.sourceCourseId;
      target.partial ||= partial;
      alias.set(key, target.id);
      gsUrl.set(target.id, c.url);
    } else {
      gsUrl.set(key, c.url);
      byId.set(key, { id: key, code: code ?? c.name, name: c.name, sources: { gradescope: c.sourceCourseId }, color: '', hidden: false, url: c.url, partial, isCourse: true }); // every Gradescope course is a class
      alias.set(key, key);
    }
  }

  // Pearson MyLab has no course codes: it belongs to the course whose content links to Pearson.
  const pearsonLaunch = new Map<string, string>();
  for (const l of snapshots.brightspace?.links ?? []) {
    const cid = alias.get(courseId('brightspace', l.sourceCourseId));
    if (cid && !pearsonLaunch.has(cid) && classifyLink(l.title, l.url)?.label === 'Pearson') {
      pearsonLaunch.set(cid, new URL(l.url, 'https://purdue.brightspace.com').href);
    }
  }
  for (const c of snapshots.pearson?.courses ?? []) {
    const key = courseId('pearson', c.sourceCourseId);
    const targetId = userState.merges[key] ?? [...pearsonLaunch.keys()][0];
    const target = targetId ? byId.get(targetId) : undefined;
    if (target) {
      target.sources.pearson = c.sourceCourseId;
      alias.set(key, target.id);
    } else {
      byId.set(key, { id: key, code: 'Pearson MyLab', name: c.name, sources: { pearson: c.sourceCourseId }, color: '', hidden: false, url: c.url, partial: false, isCourse: true });
      alias.set(key, key);
    }
  }

  // Settings saved under an id that has since been folded into another course still apply to it.
  const keysOf = (id: string) => [id, ...[...alias].filter(([from, to]) => to === id && from !== id).map(([from]) => from)];
  const stable = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  stable.forEach((c, i) => {
    const keys = keysOf(c.id);
    c.color = keys.map((k) => userState.colors[k]).find(Boolean) ?? PALETTE[i % PALETTE.length]!;
    const shown = keys.some((k) => userState.shown?.[k]);
    c.hidden = keys.some((k) => userState.hidden[k]) || (!c.isCourse && !shown);
  });
  return { all: byId, alias, gsUrl, pearsonLaunch };
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  return Math.min(na.length, nb.length) >= 4 && (na.includes(nb) || nb.includes(na));
}

const isCalendarOnly = (i: Item) => i.sourceKeys.every((k) => k.startsWith('brightspace:event:'));

function isSameWork(a: Item, b: Item): boolean {
  if (a.courseId !== b.courseId) return false;
  // Two items from the same platform are different work (e.g. "Homework 3" vs "Homework 3 - Programming"),
  // except a Brightspace calendar event shadowing a real assignment/quiz.
  if (a.sources.some((s) => b.sources.includes(s)) && isCalendarOnly(a) === isCalendarOnly(b)) return false;
  if (a.dueAt && b.dueAt) return titlesMatch(a.title, b.title) && Math.abs(dueMs(a) - dueMs(b)) <= MERGE_MS;
  // One dated, one not (e.g. a content topic and its calendar event): only an exact title match counts.
  return normalizeTitle(a.title) === normalizeTitle(b.title);
}

function mergeInto(target: Item, incoming: Item): void {
  const incomingWins =
    incoming.sources.includes('gradescope') ||
    (!target.sources.includes('gradescope') && TYPE_RANK[incoming.type] > TYPE_RANK[target.type]);
  if (incomingWins) {
    target.url = incoming.url;
    target.dueAt = incoming.dueAt ?? target.dueAt;
  } else if (!target.dueAt) {
    target.dueAt = incoming.dueAt;
  }
  if (TYPE_RANK[incoming.type] > TYPE_RANK[target.type]) target.type = incoming.type;
  const t1 = stripDueSuffix(target.title);
  const t2 = stripDueSuffix(incoming.title);
  target.title = t2.length > t1.length ? t2 : t1;
  target.sources = [...new Set([...target.sources, ...incoming.sources])];
  target.sourceKeys = [...new Set([...target.sourceKeys, ...incoming.sourceKeys])].sort();
  target.submitted ||= incoming.submitted;
}

function fromRaw(r: RawItem, cid: string): Item {
  const key = `${r.source}:${r.sourceItemId}`;
  return {
    id: key,
    courseId: cid,
    title: r.title,
    type: r.type,
    dueAt: r.dueAt,
    url: r.url,
    sources: [r.source],
    sourceKeys: [key],
    submitted: r.submitted,
    doneByUser: false,
  };
}

function buildLinks(input: DashboardInput, courses: Course[], alias: Map<string, string>, gsUrl: Map<string, string>): CourseLink[] {
  const perCourse = new Map<string, CourseLink[]>(courses.map((c) => [c.id, []]));
  const add = (l: CourseLink) => {
    const list = perCourse.get(l.courseId);
    if (!list) return;
    const dup = list.some((x) => x.url === l.url || (l.category !== 'website' && x.category !== 'website' && x.label === l.label));
    if (!dup) list.push(l);
  };
  // A Gradescope launch in the course's Brightspace content beats the direct gradescope.com page: it signs the student in.
  const gsLaunch = new Map<string, string>();
  for (const r of input.snapshots.brightspace?.links ?? []) {
    const cid = alias.get(courseId('brightspace', r.sourceCourseId));
    const url = new URL(r.url, 'https://purdue.brightspace.com');
    if (cid && !gsLaunch.has(cid) && url.origin === 'https://purdue.brightspace.com' && classifyLink(r.title, r.url)?.label === 'Gradescope') {
      gsLaunch.set(cid, url.href);
    }
  }
  for (const c of courses) {
    if (c.sources.brightspace) add({ courseId: c.id, label: 'Brightspace', url: c.url, category: 'lms', source: 'brightspace' });
    const gs = gsLaunch.get(c.id) ?? gsUrl.get(c.id);
    if (gs) add({ courseId: c.id, label: 'Gradescope', url: gs, category: 'homework', source: 'brightspace' });
  }
  for (const r of input.snapshots.brightspace?.links ?? []) {
    const cid = alias.get(courseId('brightspace', r.sourceCourseId));
    const kind = classifyLink(r.title, r.url);
    if (cid && kind) add({ courseId: cid, label: kind.label, url: new URL(r.url, 'https://purdue.brightspace.com').href, category: kind.category, source: 'brightspace' });
  }
  for (const l of input.manualLinks) add({ ...l, courseId: alias.get(l.courseId) ?? l.courseId });
  return courses.flatMap((c) => perCourse.get(c.id) ?? []);
}

/** Instructors sometimes write the deadline into the title: "HW11 (10.3, 12.1)_due_Nov 11". Only with "due". */
function fillFromTitle(m: Item, now: Date): void {
  const match = findDueMatches(m.title.replace(/_/g, ' '), now).find((x) => x.label === 'due');
  if (!match) return;
  m.dueAt = match.dueAt;
  m.dueFrom = 'title';
}

/**
 * An undated item takes a date read on a platform page: first the one stored for one of its own source keys (a
 * visit), then one stored under its title (a page the student opened). Items with any other date keep it.
 */
function fillFromCaptured(m: Item, captured: StoreShape['captured'] | undefined): void {
  if (!captured) return;
  // An item with its own visit record uses only that; a title match could be another course's homework.
  const own = m.sourceKeys.map((k) => captured[k]).filter((x) => x !== undefined);
  const c = own.length ? own.find((x) => x.dueAt) : captured[`title:${normalizeTitle(m.title)}`];
  if (!c?.dueAt) return;
  m.dueAt = c.dueAt;
  m.dueFrom = 'platform';
  const label = platformById(c.platform)?.label ?? c.platform;
  m.duePlatform = label;
  if (c.evidence) m.dueEvidence = `Read from ${label}: '${c.evidence}'`;
  else m.dueEvidence = `Read from ${label}`;
}

/** Combines per-platform snapshots, manual entries and user state into what the UI shows. Pure. */
export function buildDashboard(input: DashboardInput, now: Date, opts: { includeHidden?: boolean } = {}): Dashboard {
  const { all, alias, gsUrl, pearsonLaunch } = buildCourses(input);
  const visible = new Set([...all.values()].filter((c) => !c.hidden).map((c) => c.id));
  const minDue = now.getTime() - WINDOW_MS;
  // Work to hand in (assignments, quizzes, the student's own entries) stays from the start of its course's term; exams and
  // events leave 7 days after their date.
  const termStart = new Map<string, number>();
  for (const c of input.snapshots.brightspace?.courses ?? []) termStart.set(courseId('brightspace', c.sourceCourseId), courseStart(c, now));
  const guessStart = courseStart({}, now);
  const windowStart = (type: ItemType, cid: string) => (type === 'exam' || type === 'event' ? minDue : Math.min(minDue, termStart.get(cid) ?? guessStart));
  const inWindow = (i: { dueAt: string | null; type: ItemType }, cid: string) => !i.dueAt || Date.parse(i.dueAt) >= windowStart(i.type, cid);

  const raw: Item[] = [];
  for (const source of ['brightspace', 'gradescope', 'pearson'] as const) {
    for (const r of input.snapshots[source]?.items ?? []) {
      const cid = alias.get(courseId(source, r.sourceCourseId));
      if (cid && visible.has(cid) && inWindow(r, cid)) raw.push(fromRaw(r, cid));
    }
  }
  raw.sort((a, b) => dueMs(a) - dueMs(b));

  const merged: Item[] = [];
  for (const it of raw) {
    const twin = merged.find((m) => isSameWork(m, it));
    if (twin) mergeInto(twin, it);
    else merged.push(it);
  }
  for (const m of merged) {
    m.id = m.sourceKeys[0]!;
    if (!m.dueAt) fillFromTitle(m, now);
    if (!m.dueAt) fillFromCaptured(m, input.captured);
    // A MyLab session expires; the Brightspace launch link always gets the student back in.
    const launch = m.sources.includes('pearson') ? pearsonLaunch.get(m.courseId) : undefined;
    if (launch) m.url = launch;
  }
  // Dates filled in from titles and platform pages follow the same 7-day limit as the rest.
  merged.splice(0, merged.length, ...merged.filter((m) => inWindow(m, m.courseId)));

  for (const m of input.manualItems) {
    const cid = alias.get(m.courseId) ?? m.courseId;
    if (!visible.has(cid) || !inWindow({ dueAt: m.dueAt, type: 'manual' }, cid)) continue;
    merged.push({ id: m.id, courseId: cid, title: m.title, type: 'manual', dueAt: m.dueAt, url: m.url, sources: ['manual'], sourceKeys: [m.id], submitted: false, doneByUser: false });
  }
  // Whether each item was handed in: the student's choices, then what the sources said (this sync's answers included).
  const completion = foldSnapshots(input.completion ?? {}, input.snapshots, now);
  for (const m of merged) {
    const st = itemState(m.sourceKeys, completion, input.userState);
    m.doneByUser = st.doneBy?.by === 'user';
    m.submitted = st.done && st.doneBy?.by !== 'user';
    if (st.score) m.score = st.score;
    if (st.done && st.doneBy) m.doneBy = st.doneBy;
    if (st.known === 'done') m.sourcesDone = true;
    const pastDue = m.dueAt !== null && Date.parse(m.dueAt) <= now.getTime();
    if (!st.done && pastDue && (m.type === 'assignment' || m.type === 'quiz') && st.known === 'unknown') m.notSure = true;
  }

  const items = merged.sort((a, b) => dueMs(a) - dueMs(b) || a.title.localeCompare(b.title));
  const pending = (i: Item) => !i.doneByUser && !i.submitted;

  // A fixed order (by code): cards keep their place when work is done or dates change.
  const courses = [...all.values()]
    .filter((c) => opts.includeHidden || !c.hidden)
    .sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));

  const links = buildLinks(input, courses, alias, gsUrl);
  const nextDue = items.find((i) => pending(i) && i.dueAt && dueMs(i) > now.getTime()) ?? null;
  return { courses, items, links, nextDue };
}

/** Pending (not done, not submitted) items due in the next 48 hours / next 7 days. Overdue items are not counted. */
export function dueCounts(items: Item[], now: Date): { within48: number; week: number } {
  let within48 = 0;
  let week = 0;
  for (const i of items) {
    if (i.doneByUser || i.submitted || !i.dueAt) continue;
    const diff = Date.parse(i.dueAt) - now.getTime();
    if (diff <= 0) continue;
    if (diff <= 48 * 3600_000) within48++;
    if (diff <= 7 * 86400_000) week++;
  }
  return { within48, week };
}
