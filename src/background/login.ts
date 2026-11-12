import { BRIGHTSPACE_HOST, SIGN_IN } from '../visits/hosts';

const HOME = `https://${BRIGHTSPACE_HOST}/d2l/home`;

/** True for the Brightspace home page: the student is back from signing in (login steps like /d2l/lp/auth/... do not count). */
export function loginReturn(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === BRIGHTSPACE_HOST && (u.pathname === '/d2l/home' || u.pathname.startsWith('/d2l/home/')) && !SIGN_IN.test(url);
  } catch {
    return false;
  }
}

export interface BeginLoginDeps {
  signedIn(): Promise<boolean>;
  navigate(tabId: number, url: string): Promise<void>;
  remember(tabId: number | null): Promise<void>;
}

/** The login tab is forgotten after this long. */
export const LOGIN_TAB_TTL_MS = 15 * 60_000;

/** Already signed in: nothing to do. Otherwise send the tab to Brightspace (which redirects to sign-in) and remember it. */
export async function beginLogin(tabId: number, deps: BeginLoginDeps): Promise<{ signedIn: boolean }> {
  if (await deps.signedIn()) return { signedIn: true };
  await deps.remember(tabId);
  await deps.navigate(tabId, HOME);
  return { signedIn: false };
}

export interface TabUpdatedDeps {
  remembered(): Promise<{ id: number; at: number } | undefined>;
  navigate(tabId: number, url: string): Promise<void>;
  remember(tabId: number | null): Promise<void>;
  dashboardUrl: string;
  now: () => number;
}

/** When the remembered tab finishes loading the Brightspace home page, send it to the dashboard and forget it. */
export async function onTabUpdated(tabId: number, url: string | undefined, complete: boolean, deps: TabUpdatedDeps): Promise<void> {
  if (!complete || !loginReturn(url)) return;
  const entry = await deps.remembered();
  if (!entry) return;
  if (deps.now() - entry.at > LOGIN_TAB_TTL_MS) return deps.remember(null);
  if (entry.id !== tabId) return;
  await deps.remember(null);
  await deps.navigate(tabId, deps.dashboardUrl);
}

export interface NewTabLoginDeps {
  signedIn(): Promise<boolean>;
  createTab(url: string): Promise<{ id?: number }>;
  remember(tabId: number | null): Promise<void>;
}

/** For callers without a tab of their own (the popup): open Brightspace in a new tab and remember it. */
export async function beginLoginNewTab(deps: NewTabLoginDeps): Promise<{ signedIn: boolean }> {
  if (await deps.signedIn()) return { signedIn: true };
  const tab = await deps.createTab(HOME);
  if (tab.id !== undefined) await deps.remember(tab.id);
  return { signedIn: false };
}
