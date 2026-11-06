import type { StoreShape } from '../core/types';
import { scrubHtml } from './scrub';

const R = '[REDACTED]';

/** Query parameters whose values identify a session or user. */
const SECRET_PARAM = /(session|token|auth|key|sig|user|email|id)$/i;

function scrubUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (SECRET_PARAM.test(k)) u.searchParams.set(k, R);
    return u.href.replace(/%5BREDACTED%5D/g, R);
  } catch {
    return '[invalid url]';
  }
}

/**
 * A page's HTML made safe to send to the developer: emails, the user's name, hidden/typed form values,
 * CSRF tokens and token-like JSON values removed. The assignments and dates stay.
 */
export function scrubPage(html: string, url: string, secrets: string[], now: Date): string {
  const cleaned = html
    .replace(/(<input\b[^>]*\bvalue=")[^"]*(")/gi, `$1${R}$2`)
    .replace(/(<meta[^>]+name="csrf-token"[^>]+content=")[^"]*(")/gi, `$1${R}$2`)
    .replace(/("(?:[\w-]*(?:token|session|secret|password|auth)[\w-]*)"\s*:\s*")[^"]*(")/gi, `$1${R}$2`);
  const body = scrubHtml(cleaned, secrets);
  return `<!-- DueBoard page export\nurl: ${scrubUrl(url)}\nexportedAt: ${now.toISOString()}\n-->\n${body}`;
}

export interface LinksBundle {
  exportedAt: string;
  partial: string[];
  courses: { id: string; name: string; code: string | null; links: { title: string; url: string }[] }[];
}

/** What DueBoard found in each Brightspace course's content: course names and raw links only. */
export function linksBundle(store: StoreShape, now: Date): LinksBundle {
  const snap = store.snapshots.brightspace;
  return {
    exportedAt: now.toISOString(),
    partial: snap?.partial ?? [],
    courses: (snap?.courses ?? []).map((c) => ({
      id: c.sourceCourseId,
      name: c.name,
      code: c.code,
      links: (snap?.links ?? []).filter((l) => l.sourceCourseId === c.sourceCourseId).map((l) => ({ title: l.title, url: l.url })),
    })),
  };
}
