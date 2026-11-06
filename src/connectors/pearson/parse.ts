import type { ItemType, RawItem } from '../../core/types';

export const PEARSON_ASSIGNMENTS_URL = 'https://mylab.pearson.com/Student/DoAssignments.aspx?view=all';

export class PearsonParseError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'PearsonParseError';
  }
}

export interface PearsonPage {
  courseId: string;
  items: RawItem[];
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const TYPES: Record<string, ItemType> = { homework: 'assignment', quiz: 'quiz', test: 'exam' };

/** "11/10/26" + "11:59pm" → ISO, read as the browser's local time (Pearson shows the course's time zone). */
export function parsePearsonDate(raw: string): string | null {
  const d = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!d) return null;
  const t = raw.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  let hour = 23;
  let minute = 59;
  if (t) {
    hour = Number(t[1]) % 12 + (t[3]!.toLowerCase() === 'pm' ? 12 : 0);
    minute = Number(t[2]);
  }
  const year = d[3]!.length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
  return new Date(year, Number(d[1]) - 1, Number(d[2]), hour, minute).toISOString();
}

/**
 * The student's Pearson MyLab "Assignments" page (DoAssignments.aspx?view=all): one table row per assignment with
 * its due date. Rows that can no longer be worked on (past due, no "do" link) are treated as done.
 */
export function parsePearson(html: string): PearsonPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table[id$="gridAssignments"], table.assignement-list-table');
  if (!table) throw new PearsonParseError('no assignments table');
  const courseId = html.match(/courseId\s*:\s*'(\d+)'/)?.[1] ?? html.match(/courseId'\s*:\s*'(\d+)'/)?.[1] ?? 'mylab';

  const items: RawItem[] = [];
  for (const row of table.querySelectorAll('tr')) {
    const dateCell = row.querySelector('td div');
    const nameCell = row.querySelector('th[scope="row"]');
    if (!dateCell || !nameCell) continue; // header row
    const link = nameCell.querySelector('a');
    const title = text(link);
    const href = link?.getAttribute('href') ?? '';
    const id = href.match(/do\w*\((\d+)/)?.[1] ?? row.innerHTML.match(/\bH_(\d+)/)?.[1] ?? row.innerHTML.match(/\b[A-Z]_(\d{5,})/)?.[1];
    const dueAt = parsePearsonDate(dateCell.innerHTML.replace(/<br\s*\/?>/gi, ' '));
    if (!title || !id || !dueAt) continue;
    const kind = nameCell.querySelector('i[title]')?.getAttribute('title')?.toLowerCase() ?? 'homework';
    const workable = /^javascript:do\w+\(/.test(href);
    const pastDue = /\bpast\b/.test(dateCell.className);
    items.push({
      source: 'pearson',
      sourceItemId: id,
      sourceCourseId: courseId,
      title,
      type: TYPES[kind] ?? 'assignment',
      dueAt,
      url: PEARSON_ASSIGNMENTS_URL,
      submitted: pastDue && !workable,
    });
  }
  return { courseId, items };
}
