import { BRIGHTSPACE_HOST, SIGN_IN } from '../visits/hosts';

const HOME = `https://${BRIGHTSPACE_HOST}/d2l/home`;

/** True for a signed-in Brightspace page: the student is back from signing in. */
export function loginReturn(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === BRIGHTSPACE_HOST && u.pathname.startsWith('/d2l/') && !SIGN_IN.test(url);
  } catch {
    return false;
  }
}

export interface BeginLoginDeps {
  signedIn(): Promise<boolean>;
  navigate(tabId: number, url: string): Promise<void>;
  remember(tabId: number | null): Promise<void>;
}

/** Already signed in: nothing to do. Otherwise send the tab to Brightspace (which redirects to sign-in) and remember it. */
export async function beginLogin(tabId: number, deps: BeginLoginDeps): Promise<{ signedIn: boolean }> {
  if (await deps.signedIn()) return { signedIn: true };
  await deps.remember(tabId);
  await deps.navigate(tabId, HOME);
  return { signedIn: false };
}

export interface TabUpdatedDeps {
  remembered(): Promise<number | undefined>;
  navigate(tabId: number, url: string): Promise<void>;
  remember(tabId: number | null): Promise<void>;
  dashboardUrl: string;
}

/** When the remembered tab finishes loading a signed-in Brightspace page, send it to the dashboard and forget it. */
export async function onTabUpdated(tabId: number, url: string | undefined, complete: boolean, deps: TabUpdatedDeps): Promise<void> {
  if (!complete || !loginReturn(url)) return;
  if ((await deps.remembered()) !== tabId) return;
  await deps.remember(null);
  await deps.navigate(tabId, deps.dashboardUrl);
}
