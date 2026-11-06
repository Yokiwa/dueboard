import { AuthError, getJson } from '../http';
import { createLimiter } from '../limit';
import type { Connector, ConnectorResult, RawItem, RawLink } from '../../core/types';
import {
  urls,
  type CalendarEvent,
  type DropboxFolder,
  type EnrollmentPage,
  type MySubmission,
  type ObjectListPage,
  type Quiz,
  type Toc,
  type VersionInfo,
} from './api';
import { folderDue, isCurrent, toCourse, toDropboxItem, toEventItem, toQuizItem, tocItems, tocLinks } from './map';

const DAY = 86_400_000;

export interface BrightspaceOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  base?: string;
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

      // Each endpoint fails on its own: a broken content page or one 403 must not hide the course's deadlines.
      const perCourse = ous.map(async (ou) => {
        let failed = false;
        const attempt = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
          try {
            return await fn();
          } catch {
            failed = true;
            return fallback;
          }
        };
        const [folders, quizzes, toc] = await Promise.all([
          attempt(() => get<DropboxFolder[]>(u.dropbox(ou)), [] as DropboxFolder[]),
          attempt(() => allPages<Quiz>(u.quizzes(ou)), [] as Quiz[]),
          attempt(() => get<Toc>(u.toc(ou)), { Modules: [] } as Toc),
        ]);
        const visible = folders.filter((f) => !f.IsHidden);
        // Only ask "did I submit?" for folders due between 7 days ago and 30 days ahead.
        const checkWindow = (f: DropboxFolder) => {
          const due = folderDue(f);
          if (!due) return false;
          const ms = Date.parse(due);
          return ms >= t.getTime() - 7 * DAY && ms <= t.getTime() + 30 * DAY;
        };
        const submitted = await Promise.all(
          visible.map(async (f) => {
            if (!checkWindow(f)) return false;
            try {
              const subs = await get<MySubmission[]>(u.mySubmissions(ou, f.Id));
              return subs.some((x) => x.Submissions.length > 0 || Boolean(x.CompletionDate));
            } catch {
              return false; // e.g. group folders: unknown just means "not marked submitted"
            }
          }),
        );
        visible.forEach((f, i) => items.push(toDropboxItem(f, ou, base, submitted[i]!)));
        quizzes.filter((q) => q.IsActive).forEach((q) => items.push(toQuizItem(q, ou, base)));
        links.push(...tocLinks(toc, ou, base));
        items.push(...tocItems(toc, ou, base));
        if (failed) partial.push(ou);
      });

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

      await Promise.all([...perCourse, calendar]);
      partial.sort();
      return { ok: true, courses, items, links, partial };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, reason: 'not_logged_in', detail: e.message };
      return { ok: false, reason: 'network', detail: String(e) };
    }
  }

  return { id: 'brightspace', fetchAll };
}
