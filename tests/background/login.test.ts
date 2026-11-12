import { describe, it, expect, vi } from 'vitest';
import { loginReturn, beginLogin, onTabUpdated } from '../../src/background/login';
import { fakeBrowser } from 'wxt/testing/fake-browser';
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

describe('onTabUpdated', () => {
  const mk = (remembered: number | undefined) => ({ remembered: vi.fn(async () => remembered), navigate: vi.fn(async () => undefined), remember: vi.fn(async () => undefined), dashboardUrl: DASH });
  it('sends the remembered tab to the dashboard once it lands on a return page', async () => {
    const deps = mk(5);
    await onTabUpdated(5, `${HOME}/1`, true, deps);
    expect(deps.navigate).toHaveBeenCalledWith(5, DASH);
    expect(deps.remember).toHaveBeenCalledWith(null);
  });
  it('ignores other tabs, incomplete loads and sign-in pages', async () => {
    for (const [id, url, done] of [[6, HOME, true], [5, HOME, false], [5, 'https://purdue.brightspace.com/d2l/login', true], [5, 'https://login.purdue.edu/x', true]] as const) {
      const deps = mk(5);
      await onTabUpdated(id, url, done, deps);
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(deps.remember).not.toHaveBeenCalled();
    }
  });
});

describe('login tab storage', () => {
  it('remembers and forgets a tab', async () => {
    fakeBrowser.reset();
    expect(await getLoginTab()).toBeUndefined();
    await setLoginTab(7);
    expect(await getLoginTab()).toBe(7);
    await setLoginTab(null);
    expect(await getLoginTab()).toBeUndefined();
  });
});
