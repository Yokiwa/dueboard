import type { StoreShape } from '../core/types';
import { courseTerm, readSyllabusFile, syllabusFromLines, type LineReaders } from './read';
import { navbarSyllabusLink, syllabusDue, syllabusNavDue } from './sources';

const BASE = 'https://purdue.brightspace.com';

/**
 * The background part of syllabus reading: check course navigation bars for a Syllabus launch (weekly), and read the
 * syllabus files that are due. Launches are read later by visits. Returns what changed.
 */
export async function refreshSyllabi(
  store: StoreShape,
  now: Date,
  fetchImpl: typeof fetch,
  readers: LineReaders,
): Promise<Pick<StoreShape, 'syllabus' | 'syllabusNav'>> {
  const patch: Pick<StoreShape, 'syllabus' | 'syllabusNav'> = { syllabus: {}, syllabusNav: {} };
  if (!store.settings.syllabus) return patch;
  const at = now.toISOString();

  for (const ou of syllabusNavDue(store, now)) {
    try {
      const res = await fetchImpl(`${BASE}/d2l/home/${ou}`, { credentials: 'include' });
      patch.syllabusNav[ou] = { url: res.ok ? navbarSyllabusLink(await res.text(), BASE) : null, checkedAt: at };
    } catch {
      patch.syllabusNav[ou] = { url: null, checkedAt: at };
    }
  }

  const courses = store.snapshots.brightspace?.courses ?? [];
  for (const src of syllabusDue(store, now)) {
    if (src.kind === 'visit') continue;
    const lines = await readSyllabusFile(src, fetchImpl, readers);
    const course = courses.find((c) => c.sourceCourseId === src.ou) ?? {};
    patch.syllabus[src.ou] = syllabusFromLines(src, lines, courseTerm(course, now), now);
  }
  return patch;
}
