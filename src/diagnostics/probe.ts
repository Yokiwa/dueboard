import { scrubHtml, scrubJson } from './scrub';

export const BS_BASE = 'https://purdue.brightspace.com';
export const GS_BASE = 'https://www.gradescope.com';

export interface ProbeResult {
  ok: boolean;
  status: number;
  redirectedTo?: string;
  note: string;
}
export interface ProbeReport {
  brightspace: ProbeResult;
  gradescope: ProbeResult;
}

async function probeOne(
  fetchImpl: typeof fetch,
  url: string,
  looksOk: (body: string) => boolean,
): Promise<ProbeResult> {
  try {
    const res = await fetchImpl(url, { credentials: 'include' });
    const body = (await res.text()).slice(0, 2000);
    const redirectedTo = res.redirected ? res.url : undefined;
    const ok = res.ok && !redirectedTo?.match(/login/i) && looksOk(body);
    return { ok, status: res.status, redirectedTo, note: body.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, note: String(e) };
  }
}

/** /versions/ is public, so the login check uses whoami, which only answers when the browser's session is sent. */
async function probeBrightspace(fetchImpl: typeof fetch): Promise<ProbeResult> {
  let lp: string | undefined;
  try {
    const res = await fetchImpl(`${BS_BASE}/d2l/api/versions/`, { credentials: 'include' });
    const versions = (await res.json()) as VersionInfo[];
    lp = versions.find((v) => v.ProductCode === 'lp')?.LatestVersion;
  } catch (e) {
    return { ok: false, status: 0, note: `versions: ${String(e)}` };
  }
  if (!lp) return { ok: false, status: 0, note: 'versions: no lp product' };
  return probeOne(fetchImpl, `${BS_BASE}/d2l/api/lp/${lp}/users/whoami`, (b) => b.includes('"Identifier"'));
}

/** Checks whether the extension can read each platform with the browser's existing login. */
export async function probe(fetchImpl: typeof fetch = fetch): Promise<ProbeReport> {
  const [brightspace, gradescope] = await Promise.all([
    probeBrightspace(fetchImpl),
    probeOne(fetchImpl, `${GS_BASE}/account`, (b) => b.includes('courseBox')),
  ]);
  return { brightspace, gradescope };
}

/** Removes session-bound CSRF tokens so fixtures can be committed to a public repo. */
function stripTokens(html: string): string {
  return html
    .replace(/(<meta[^>]+name="csrf-token"[^>]+content=")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/(name="authenticity_token"[^>]*value=")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/(value=")[^"]*("[^>]*name="authenticity_token")/gi, '$1[REDACTED]$2');
}

export interface FixtureBundle {
  collectedAt: string;
  brightspace: Record<string, unknown>;
  gradescope: Record<string, string>;
  errors: string[];
}

interface VersionInfo {
  ProductCode: string;
  LatestVersion: string;
}

/**
 * Downloads one sample of every endpoint/page the connectors use, with personal data removed,
 * so real responses can become test fixtures.
 */
export async function collectFixtures(fetchImpl: typeof fetch = fetch): Promise<FixtureBundle> {
  const errors: string[] = [];
  const bsRaw: Record<string, unknown> = {};
  const gsRaw: Record<string, string> = {};

  const get = async (url: string, as: 'json' | 'text') => {
    try {
      const res = await fetchImpl(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      errors.push(`${url.replace(/\?.*/, '')}: ${String(e)}`);
      return undefined;
    }
  };

  const secrets: (string | undefined)[] = [];
  const versions = (await get(`${BS_BASE}/d2l/api/versions/`, 'json')) as VersionInfo[] | undefined;
  if (versions) {
    bsRaw.versions = versions;
    const lp = versions.find((v) => v.ProductCode === 'lp')?.LatestVersion;
    const le = versions.find((v) => v.ProductCode === 'le')?.LatestVersion;
    const who = (await get(`${BS_BASE}/d2l/api/lp/${lp}/users/whoami`, 'json')) as Record<string, string> | undefined;
    if (who) {
      secrets.push(
        `${who.FirstName} ${who.LastName}`,
        who.UniqueName,
        who.Identifier,
        who.ProfileIdentifier,
        who.OrgDefinedId,
      );
    }
    const enr = (await get(`${BS_BASE}/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3`, 'json')) as
      | { Items: { OrgUnit: { Id: number }; Access: { IsActive: boolean; CanAccess: boolean } }[] }
      | undefined;
    if (enr) {
      bsRaw.enrollments = enr;
      const active = enr.Items.filter((i) => i.Access.IsActive && i.Access.CanAccess).map((i) => i.OrgUnit.Id);
      const ou = active[0];
      if (ou !== undefined) {
        const folders = (await get(`${BS_BASE}/d2l/api/le/${le}/${ou}/dropbox/folders/`, 'json')) as
          | { Id: number }[]
          | undefined;
        if (folders) {
          bsRaw.dropbox = folders;
          if (folders[0]) {
            bsRaw.mysubmissions = await get(
              `${BS_BASE}/d2l/api/le/${le}/${ou}/dropbox/folders/${folders[0].Id}/submissions/mysubmissions/`,
              'json',
            );
          }
        }
        bsRaw.quizzes = await get(`${BS_BASE}/d2l/api/le/${le}/${ou}/quizzes/`, 'json');
        bsRaw.toc = await get(`${BS_BASE}/d2l/api/le/${le}/${ou}/content/toc`, 'json');
      }
      const now = Date.now();
      const start = new Date(now - 7 * 86400_000).toISOString();
      const end = new Date(now + 60 * 86400_000).toISOString();
      bsRaw.calendar = await get(
        `${BS_BASE}/d2l/api/le/${le}/calendar/events/myEvents/?orgUnitIdsCSV=${active.join(',')}&startDateTime=${start}&endDateTime=${end}`,
        'json',
      );
    }
  }

  const account = (await get(`${GS_BASE}/account`, 'text')) as string | undefined;
  if (account) {
    gsRaw.account = account;
    const courseId = account.match(/href="\/courses\/(\d+)"/)?.[1];
    if (courseId) {
      const course = (await get(`${GS_BASE}/courses/${courseId}`, 'text')) as string | undefined;
      if (course) gsRaw.course = course;
    }
  }

  const live = secrets.filter((s): s is string => typeof s === 'string' && s.length > 0);
  const brightspace = Object.fromEntries(
    Object.entries(bsRaw)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, scrubJson(v, live)]),
  );
  const gradescope = Object.fromEntries(Object.entries(gsRaw).map(([k, v]) => [k, scrubHtml(stripTokens(v), live)]));
  return { collectedAt: new Date().toISOString(), brightspace, gradescope, errors };
}
