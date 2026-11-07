import type { CapturedDue } from '../core/types';

const YEAR = 365 * 86_400_000;

/**
 * Background-side check of a due date sent by the Wiley content script: it must come from a Wiley page and look
 * sane. Anything else is dropped, so other pages can't plant fake deadlines.
 */
export function acceptCapture(msg: Record<string, unknown>, senderUrl: string | undefined, now: Date, opts: { fromVisit?: boolean } = {}): CapturedDue | null {
  // In DueBoard's own visit window the visit records the result per item; a title capture could leak to other courses.
  if (opts.fromVisit) return null;
  let host = '';
  try {
    host = new URL(senderUrl ?? '').hostname;
  } catch {
    return null;
  }
  if (host !== 'education.wiley.com') return null;
  const title = typeof msg.title === 'string' ? msg.title.trim() : '';
  const due = typeof msg.dueAt === 'string' ? Date.parse(msg.dueAt) : NaN;
  if (!title || title.length > 300 || Number.isNaN(due) || Math.abs(due - now.getTime()) > YEAR) return null;
  return { title, dueAt: new Date(due).toISOString(), platform: 'wileyplus', via: 'opened', checkedAt: now.toISOString() };
}
