import type { LinkCategory } from './types';

export const BS_BASE = 'https://purdue.brightspace.com';

interface Platform {
  label: string;
  category: LinkCategory;
  host: RegExp;
  title: RegExp;
}

// Order matters: first match wins.
const PLATFORMS: Platform[] = [
  { label: 'Gradescope', category: 'homework', host: /(^|\.)gradescope\.com$/, title: /gradescope/i },
  { label: 'WebAssign', category: 'homework', host: /(^|\.)webassign\.net$/, title: /webassign/i },
  { label: 'Achieve', category: 'homework', host: /(^|\.)macmillanlearning\.com$/, title: /\bachieve\b|macmillan/i },
  { label: 'Pearson', category: 'homework', host: /pearson|mylab|mastering/, title: /pearson|mylab|mastering/i },
  { label: 'McGraw-Hill Connect', category: 'homework', host: /(^|\.)mheducation\.com$/, title: /mcgraw|connect\b/i },
  { label: 'Cengage', category: 'textbook', host: /(^|\.)cengage\.com$/, title: /cengage|mindtap/i },
  { label: 'zyBooks', category: 'textbook', host: /(^|\.)zybooks\.com$/, title: /zybook/i },
  { label: 'WileyPLUS', category: 'homework', host: /(^|\.)(wileyplus|wiley)\.com$/, title: /wiley/i },
  { label: 'Piazza', category: 'discussion', host: /(^|\.)piazza\.com$/, title: /piazza/i },
  { label: 'Ed', category: 'discussion', host: /(^|\.)edstem\.org$/, title: /\bed (discussion|stem)\b|edstem/i },
];

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
    const byHost = PLATFORMS.find((p) => p.host.test(u.hostname));
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
  const byTitle = PLATFORMS.find((p) => p.title.test(title));
  return byTitle ? { label: byTitle.label, category: byTitle.category } : null;
}
