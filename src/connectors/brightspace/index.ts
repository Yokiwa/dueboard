import { AuthError, getJson } from '../http';
import { createLimiter } from '../limit';
import type { CompletionRecord, Connector, ConnectorResult, RawItem, RawLink, SyllabusSource } from '../../core/types';
import { tocSyllabusSources } from '../../syllabus/sources';
import {
  urls,
  type CalendarEvent,
  type DropboxFolder,
  type EnrollmentPage,
  type GradeValue,
  type MySubmission,
  type ObjectListPage,
  type Quiz,
  type Toc,
  type VersionInfo,
} from './api';
import { attachGrades, folderDue, isCurrent, toCourse, toDropboxItem, toEventItem, toQuizItem, tocItems, tocLinks } from './map';

const DAY = 86_400_000;
/** Past-due folders asked "did I submit?" per sync beyond the usual window, most recently due first. */
const PAST_ASKS = 40;

export interface BrightspaceOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  base?: string;
  /** What is already known, so folders known done are not asked again. */
  completion?: () => Promise<Record<string, CompletionRecord>>;
}

export function createBrightspaceConnector(opts: BrightspaceOptions = {}): Connector {
  const base = opts.base ?? 'https://purdue.brightspace.com';
  const now = opts.now ?? (() => new Date());
  const limit = createLimiter(4);
  const get = <T>(url: string) => limit(() => getJson(url, opts.fetchImpl) as Promise<T>);

  async function allPages<T>(first: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = first;
    while (url) {
      const page: ObjectListPage<T> = await get<ObjectListPage<T>>(url);
      out.push(...page.Objects);
      url = page.Next;
    }
    return out;
  }

  async function fetchAll(): Promise<ConnectorResult> {
    const t = now();
    try {
      const versions = await get<VersionInfo[]>(`${base}/d2l/api/versions/`);
      const lp = versions.find((v) => v.ProductCode === 'lp')?.LatestVersion;
      const le = versions.find((v) => v.ProductCode === 'le')?.LatestVersion;
      if (!lp || !le) return { ok: false, reason: 'parse_error', detail: 'versions missing lp/le' };
      const u = urls(base, lp, le);

      const enrollments = [];
      let bookmark: string | undefined;
      do {
        const page: EnrollmentPage = await get<EnrollmentPage>(u.enrollments(bookmark));
        enrollments.push(...page.Items);
        bookmark = page.PagingInfo.HasMoreItems ? page.PagingInfo.Bookmark : undefined;
      } while (bookmark);

      const courses = enrollments.filter((e) => isCurrent(e, t)).map((e) => toCourse(e, base));
      const ous = courses.map((c) => c.sourceCourseId);
      const items: RawItem[] = [];
      const links: RawLink[] = [];
      const partial: string[] = [];
      const syllabusSources: SyllabusSource[] = [];

      const calendar = (async () => {
        if (ous.length === 0) return;
        const start = new Date(t.getTime() - 7 * DAY).toISOString();
        const end = new Date(t.getTime() + 60 * DAY).toISOString();
        try {
          const events = await allPages<CalendarEvent>(u.calendar(ous, start, end));
          for (const ev of events) {
            if (!ous.includes(String(ev.OrgUnitId))) continue;
            const it = toEventItem(ev, base);
            if (it) items.push(it);
          }
        } catch {
          // Calendar is a bonus source; dropbox and quizzes already cover most deadlines.
        }
      })();

      const known = (await opts.completion?.().catch(() => undefined)) ?? {};

      // Each endpoint fails on its own: a broken content page or one 403 must not hide the course's deadlines.
      const fetched = await Promise.all(
        ous.map(async (ou) => {
          let failed = false;
          const attempt = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
            try {
              return await fn();
            } catch {
              failed = true;
              return fallback;
            }
          };
          // Scores are a bonus: a failed gradebook request never marks the course partial. Every error is swallowed, 401
          // included, because the other endpoints already surface sign-out.
          const gradesPromise = get<GradeValue[]>(u.grades(ou)).then(
            (g) => (Array.isArray(g) ? g : []),
            () => [] as GradeValue[],
          );
          const [folders, quizzes, toc, grades] = await Promise.all([
            attempt(() => get<DropboxFolder[]>(u.dropbox(ou)), [] as DropboxFolder[]),
            attempt(() => allPages<Quiz>(u.quizzes(ou)), [] as Quiz[]),
            attempt(() => get<Toc>(u.toc(ou)), { Modules: [] } as Toc),
            gradesPromise,
          ]);
          return { ou, failed, visible: folders.filter((f) => !f.IsHidden), quizzes, toc, grades };
        }),
      );

      // "Did I submit?": folders due between 7 days ago and 30 days ahead, plus past-due folders of the term not yet
      // known done, the most recently due first, at most PAST_ASKS of those.
      const dueMs = (f: DropboxFolder) => {
        const d = folderDue(f);
        return d ? Date.parse(d) : Number.NaN;
      };
      const ask = new Set<string>();
      const past: { ou: string; f: DropboxFolder }[] = [];
      for (const c of fetched) {
        for (const f of c.visible) {
          const ms = dueMs(f);
          if (Number.isNaN(ms)) continue;
          if (ms >= t.getTime() - 7 * DAY && ms <= t.getTime() + 30 * DAY) ask.add(`${c.ou}:${f.Id}`);
          else if (ms < t.getTime() - 7 * DAY && known[`brightspace:dropbox:${f.Id}`]?.state !== 'done') past.push({ ou: c.ou, f });
        }
      }
      past.sort((a, b) => dueMs(b.f) - dueMs(a.f));
      for (const p of past.slice(0, PAST_ASKS)) ask.add(`${p.ou}:${p.f.Id}`);

      for (const c of fetched) {
        const { ou, visible, quizzes, toc } = c;
        const submitted = await Promise.all(
          visible.map(async (f): Promise<boolean | null> => {
            if (!ask.has(`${ou}:${f.Id}`)) return null;
            try {
              const subs = await get<MySubmission[]>(u.mySubmissions(ou, f.Id));
              return subs.some((x) => x.Submissions.length > 0 || Boolean(x.CompletionDate));
            } catch {
              return null; // e.g. group folders: no answer, not "not submitted"
            }
          }),
        );
        const courseItems: RawItem[] = [];
        visible.forEach((f, i) => courseItems.push(toDropboxItem(f, ou, base, submitted[i]!)));
        quizzes.filter((q) => q.IsActive).forEach((q) => courseItems.push(toQuizItem(q, ou, base)));
        courseItems.push(...tocItems(toc, ou, base));
        const gradeIdOf = new Map<string, string>();
        for (const f of visible) if (f.GradeItemId != null) gradeIdOf.set(`dropbox:${f.Id}`, String(f.GradeItemId));
        for (const q of quizzes) if (q.GradeItemId != null) gradeIdOf.set(`quiz:${q.QuizId}`, String(q.GradeItemId));
        attachGrades(courseItems, c.grades, gradeIdOf);
        items.push(...courseItems);
        links.push(...tocLinks(toc, ou, base));
        syllabusSources.push(...tocSyllabusSources(toc, ou, base));
        if (c.failed) partial.push(ou);
      }


      await calendar;
      partial.sort();
      syllabusSources.sort((a, b) => a.ou.localeCompare(b.ou));
      return { ok: true, courses, items, links, partial, syllabusSources };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, reason: 'not_logged_in', detail: e.message };
      return { ok: false, reason: 'network', detail: String(e) };
    }
  }

  return { id: 'brightspace', fetchAll };
}
