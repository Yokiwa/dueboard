/** Brightspace's own sign-in page, Purdue's identity provider, and Duo. */
export const SIGN_IN = /\/d2l\/login|login\.purdue\.edu|\/idp\/profile\/|duosecurity\.com/i;

export const BRIGHTSPACE_HOST = 'purdue.brightspace.com';

/**
 * Where a platform's sign-in through Brightspace ends: the host whose session DueBoard reads. Pearson passes through
 * interop.pearson.com first; leaving there early leaves no MyLab session behind.
 */
export const SESSION_HOSTS: Partial<Record<string, string>> = {
  gradescope: 'www.gradescope.com',
  pearson: 'mylab.pearson.com',
};

/**
 * The sign-in through Brightspace has reached the page its session belongs to. Pearson goes Brightspace → interop →
 * console.pearson.com (press Assignments) → MyLab's launch address (/api/..., which hands off once more) → a MyLab page:
 * only that last page means the MyLab session exists.
 */
export function sessionDone(platform: string | undefined, url: string): boolean {
  const until = platform ? SESSION_HOSTS[platform] : undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!until) return u.hostname !== BRIGHTSPACE_HOST;
  if (u.hostname !== until) return false;
  return !(platform === 'pearson' && u.pathname.startsWith('/api/'));
}
