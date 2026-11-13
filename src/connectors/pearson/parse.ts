import { PEARSON_TABLE } from './sessionPage';
import type { ItemType, RawItem, Score } from '../../core/types';

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
  /** Rows whose score cell still holds a "see score" link (plain data: it crosses runtime.sendMessage). */
  scoreCells: { itemId: string; cellId: string; dueAt: string }[];
  /** Every named input of #aspnetForm, as WebForm_InitCallback collects them. */
  form: Record<string, string>;
}

/** A percentage ("92 %" → "92%"); anything else is not trusted as a score. */
function percent(raw: string): string | null {
  const m = raw.replace(/\s+/g, ' ').trim().match(/^(\d{1,3}(?:\.\d+)?)\s?%$/);
  return m && Number(m[1]) <= 200 ? `${m[1]}%` : null;
}

/**
 * The callback answer: `[<n>|<n characters of event validation>]s<type>_<id>_<IV>_<category>_<average>_<score>`.
 * Returns the score, or null for an error, a sign-in page or anything of another shape.
 */
export function parseScoreAnswer(body: string, cellId: string): string | null {
  let rest = body.trim();
  const v = rest.match(/^(\d+)\|/);
  if (v) rest = rest.slice(v[0].length + Number(v[1]));
  if (!rest.startsWith('s')) return null;
  const parts = rest.slice(1).split('_');
  if (parts.length !== 6 || parts.slice(0, 5).join('_') !== cellId) return null; // an answer for another row is no answer
  return percent(parts[5]!);
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
  const table = doc.querySelector(PEARSON_TABLE);
  if (!table) throw new PearsonParseError('no assignments table');
  const courseId = html.match(/courseId\s*:\s*'(\d+)'/)?.[1] ?? html.match(/courseId'\s*:\s*'(\d+)'/)?.[1] ?? 'mylab';

  const items: RawItem[] = [];
  const scoreCells: PearsonPage['scoreCells'] = [];
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
    const cell = [...row.querySelectorAll('div[id]')].find((d) => /^[A-Z]_\d+_/.test(d.id));
    const cellId = cell?.id ?? '';
    let score: Score | undefined;
    if (cell && /^[A-Z]_\d+_/.test(cellId)) {
      if (cell.querySelector('a')) {
        if (/see score/i.test(text(cell))) scoreCells.push({ itemId: id, cellId, dueAt });
      } else {
        const shown = percent(text(cell));
        if (shown) score = { text: shown, from: 'Pearson' };
      }
    }
    items.push({
      source: 'pearson',
      sourceItemId: id,
      sourceCourseId: courseId,
      title,
      type: TYPES[kind] ?? 'assignment',
      dueAt,
      url: PEARSON_ASSIGNMENTS_URL,
      submitted: pastDue && !workable,
      ...(score ? { score } : {}),
    });
  }
  if (items.length === 0 && !/\bno assignments\b/i.test(table.textContent ?? '')) {
    throw new PearsonParseError('assignments table has no readable rows (possibly still loading)');
  }
  const form: Record<string, string> = {};
  for (const el of doc.querySelectorAll('#aspnetForm input[name], #aspnetForm select[name], #aspnetForm textarea[name]')) {
    const name = el.getAttribute('name')!;
    if (el.hasAttribute('disabled')) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      const opts = [...el.querySelectorAll('option')];
      const chosen = opts.find((o) => o.hasAttribute('selected')) ?? opts[0];
      if (chosen) form[name] = chosen.getAttribute('value') ?? chosen.textContent ?? '';
    } else if (tag === 'textarea') {
      form[name] = el.textContent ?? '';
    } else {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (['submit', 'button', 'image', 'file', 'reset'].includes(type)) continue;
      if ((type === 'checkbox' || type === 'radio') && !el.hasAttribute('checked')) continue;
      form[name] = el.getAttribute('value') ?? '';
    }
  }
  return { courseId, items, scoreCells, form };
}
