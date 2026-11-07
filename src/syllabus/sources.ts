import type { StoreShape, SyllabusSource } from '../core/types';
import type { Toc, TocModule } from '../connectors/brightspace/api';

export type { SyllabusSource };

export const SYLLABUS_TITLE = /syllabus|schedule|course calendar|important dates/i;
const WEEK = 7 * 86_400_000;
const LAUNCH = /\/lti\/|quickLink.*[?&]type=lti/i;

/** Syllabus files (PDF, HTML) and syllabus launches in a course's content. Word files are skipped. */
export function tocSyllabusSources(toc: Toc, ou: string, base: string): SyllabusSource[] {
  const out: SyllabusSource[] = [];
  const walk = (m: TocModule) => {
    for (const t of m.Topics ?? []) {
      if (!t.Url || !SYLLABUS_TITLE.test(t.Title)) continue;
      let url: URL;
      try {
        url = new URL(t.Url, base);
      } catch {
        continue;
      }
      const modified = t.LastModifiedDate ?? null;
      const external = url.origin !== new URL(base).origin;
      if (t.TypeIdentifier === 'File' && /\.pdf$/i.test(url.pathname)) out.push({ ou, kind: 'pdf', url: url.href, title: t.Title, modified });
      else if (t.TypeIdentifier === 'File' && /\.html?$/i.test(url.pathname)) out.push({ ou, kind: 'html', url: url.href, title: t.Title, modified });
      else if (LAUNCH.test(t.Url) || (external && /(^|\.)simplesyllabus\.com$/i.test(url.hostname))) out.push({ ou, kind: 'visit', url: url.href, title: t.Title, modified });
    }
    for (const child of m.Modules ?? []) walk(child);
  };
  for (const m of toc.Modules ?? []) walk(m);
  return out;
}

/** The "Syllabus" launch in a course home page's navigation bar (Simple Syllabus at Purdue), if any. */
export function navbarSyllabusLink(html: string, base: string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*Syllabus\s*(?:<\/[^>]+>\s*)*<\/a>/gi)) {
    const href = m[1]!.replace(/&amp;/g, '&');
    if (!LAUNCH.test(href) && !/simplesyllabus\.com/i.test(href)) continue;
    try {
      return new URL(href, base).href;
    } catch {
      // not a URL
    }
  }
  return null;
}

/** Content sources plus navigation-bar launches, for every current Brightspace course. */
export function syllabusSources(store: StoreShape): SyllabusSource[] {
  const fromToc = store.snapshots.brightspace?.syllabusSources ?? [];
  const fromNav = Object.entries(store.syllabusNav)
    .filter(([ou, v]) => v.url && !fromToc.some((s) => s.ou === ou))
    .map(([ou, v]): SyllabusSource => ({ ou, kind: 'visit', url: v.url!, title: 'Syllabus', modified: null }));
  return [...fromToc, ...fromNav];
}

/** One source per course to read now: new, changed, or read more than a week ago. Launches win over files. */
export function syllabusDue(store: StoreShape, now: Date): SyllabusSource[] {
  if (!store.settings.syllabus) return [];
  const byCourse = new Map<string, SyllabusSource>();
  for (const s of syllabusSources(store)) {
    const prev = byCourse.get(s.ou);
    if (!prev || (prev.kind !== 'visit' && s.kind === 'visit')) byCourse.set(s.ou, s);
  }
  return [...byCourse.values()].filter((s) => {
    const read = store.syllabus[s.ou];
    if (!read || read.source !== s.url) return true;
    if (s.modified && s.modified !== read.modified) return true;
    return now.getTime() - Date.parse(read.readAt) > WEEK;
  });
}

/** Courses whose navigation bar to check for a Syllabus launch: no syllabus in Content, not checked this week. */
export function syllabusNavDue(store: StoreShape, now: Date): string[] {
  if (!store.settings.syllabus) return [];
  const inToc = new Set((store.snapshots.brightspace?.syllabusSources ?? []).map((s) => s.ou));
  return (store.snapshots.brightspace?.courses ?? [])
    .map((c) => c.sourceCourseId)
    .filter((ou) => {
      if (inToc.has(ou)) return false;
      const nav = store.syllabusNav[ou];
      return !nav || now.getTime() - Date.parse(nav.checkedAt) > WEEK;
    });
}
