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
