import { describe, it, expect, vi } from 'vitest';
import { loginReturn, beginLogin, beginLoginNewTab, onTabUpdated } from '../../src/background/login';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isOwnPageSender } from '../../src/visits/frame/probe';
import { getLoginTab, setLoginTab } from '../../src/storage/store';

const HOME = 'https://purdue.brightspace.com/d2l/home';
const DASH = 'chrome-extension://abc/dashboard.html?start=1';

describe('loginReturn', () => {
  it('is true for Brightspace pages that are not sign-in pages', () => {
    expect(loginReturn(`${HOME}`)).toBe(true);
    expect(loginReturn(`${HOME}/123`)).toBe(true);
  });
  it('is false for sign-in pages, other sites and nothing', () => {
    expect(loginReturn('https://purdue.brightspace.com/d2l/login')).toBe(false);
    for (const path of ['/d2l/lp/auth/login/ProcessLoginActions.d2l', '/d2l/lp/auth/saml/Login', '/d2l/lp/auth/twofactor/Verify', '/d2l/le/content/1/viewContent/2/View', '/d2l/homework'])
      expect(loginReturn(`https://purdue.brightspace.com${path}`)).toBe(false);
    expect(loginReturn('https://login.purdue.edu/idp/profile/SAML2/Redirect/SSO')).toBe(false);
    expect(loginReturn('https://api-1234.duosecurity.com/frame/web/v1/auth')).toBe(false);
    expect(loginReturn('https://example.com/d2l/home')).toBe(false);
    expect(loginReturn(undefined)).toBe(false);
  });
});

describe('beginLogin', () => {
  it('does nothing when already signed in', async () => {
    const deps = { signedIn: vi.fn(async () => true), navigate: vi.fn(async () => undefined), remember: vi.fn(async () => undefined) };
    expect(await beginLogin(5, deps)).toEqual({ signedIn: true });
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.remember).not.toHaveBeenCalled();
  });
  it('navigates and remembers the tab when signed out', async () => {
    const deps = { signedIn: vi.fn(async () => false), navigate: vi.fn(async () => undefined), remember: vi.fn(async () => undefined) };
    expect(await beginLogin(5, deps)).toEqual({ signedIn: false });
    expect(deps.navigate).toHaveBeenCalledWith(5, HOME);
    expect(deps.remember).toHaveBeenCalledWith(5);
  });
});

describe('beginLoginNewTab', () => {
  it('opens no tab when signed in', async () => {
    const deps = { signedIn: vi.fn(async () => true), createTab: vi.fn(async () => ({ id: 9 })), remember: vi.fn(async () => undefined) };
    expect(await beginLoginNewTab(deps)).toEqual({ signedIn: true });
    expect(deps.createTab).not.toHaveBeenCalled();
  });
  it('opens the Brightspace home page and remembers the tab when signed out', async () => {
    const deps = { signedIn: vi.fn(async () => false), createTab: vi.fn(async () => ({ id: 9 })), remember: vi.fn(async () => undefined) };
    expect(await beginLoginNewTab(deps)).toEqual({ signedIn: false });
    expect(deps.createTab).toHaveBeenCalledWith(HOME);
    expect(deps.remember).toHaveBeenCalledWith(9);
  });
});

describe('isOwnPageSender', () => {
  it('accepts a popup sender with no tab', () => {
    expect(isOwnPageSender({ url: 'chrome-extension://abc/popup.html' }, 'chrome-extension://abc/')).toBe(true);
  });
});

describe('onTabUpdated', () => {
  const T0 = 1_000_000;
  const mk = (remembered: { id: number; at: number } | undefined, now = T0) => ({ remembered: vi.fn(async () => remembered), navigate: vi.fn(async () => undefined), remember: vi.fn(async () => undefined), dashboardUrl: DASH, now: () => now });
  it('sends the remembered tab to the dashboard once it lands on a return page', async () => {
    const deps = mk({ id: 5, at: T0 });
    await onTabUpdated(5, `${HOME}/1`, true, deps);
    expect(deps.navigate).toHaveBeenCalledWith(5, DASH);
    expect(deps.remember).toHaveBeenCalledWith(null);
  });
  it('ignores other tabs, incomplete loads and sign-in pages', async () => {
    for (const [id, url, done] of [[6, HOME, true], [5, HOME, false], [5, 'https://purdue.brightspace.com/d2l/login', true], [5, 'https://login.purdue.edu/x', true]] as const) {
      const deps = mk({ id: 5, at: T0 });
      await onTabUpdated(id, url, done, deps);
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(deps.remember).not.toHaveBeenCalled();
    }
  });
  it('still redirects just under 15 minutes', async () => {
    const deps = mk({ id: 5, at: T0 }, T0 + 14 * 60_000);
    await onTabUpdated(5, HOME, true, deps);
    expect(deps.navigate).toHaveBeenCalledWith(5, DASH);
  });
  it('ignores and clears an entry older than 15 minutes', async () => {
    const deps = mk({ id: 5, at: T0 }, T0 + 15 * 60_000 + 1);
    await onTabUpdated(5, HOME, true, deps);
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.remember).toHaveBeenCalledWith(null);
  });
});

describe('login tab storage', () => {
  it('remembers and forgets a tab', async () => {
    fakeBrowser.reset();
    expect(await getLoginTab()).toBeUndefined();
    await setLoginTab(7);
    expect((await getLoginTab())?.id).toBe(7);
    expect(typeof (await getLoginTab())?.at).toBe('number');
    await setLoginTab(null);
    expect(await getLoginTab()).toBeUndefined();
  });
});
