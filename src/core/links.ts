import type { LinkCategory } from './types';
import { platformByHost, platformByTitle } from './platformRegistry';

export const BS_BASE = 'https://purdue.brightspace.com';

/**
 * Decides whether a link found in a course's content is worth a shortcut button, and how to label it.
 * Returns null for ordinary Brightspace content pages and non-web links.
 */
export function classifyLink(title: string, url: string): { label: string; category: LinkCategory } | null {
  let u: URL;
  try {
    u = new URL(url, BS_BASE);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const internal = u.origin === BS_BASE;
  if (!internal) {
    const byHost = platformByHost(u.hostname);
    if (byHost) return { label: byHost.label, category: byHost.category };
    return { label: title.trim() || u.hostname, category: 'website' };
  }
  // Inside Brightspace only launches count: LTI paths, quickLinks of type=lti, or a content topic page
  // (some platforms appear only as a topic) — and only when the title names a known platform.
  const isLaunch =
    /\/lti\//i.test(u.pathname) ||
    (/quickLink/i.test(u.pathname) && /(^|[?&])type=lti(&|$)/i.test(u.search)) ||
    /\/viewContent\/\d+\/View$/i.test(u.pathname);
  if (!isLaunch) return null;
  const byTitle = platformByTitle(title);
  return byTitle ? { label: byTitle.label, category: byTitle.category } : null;
}
