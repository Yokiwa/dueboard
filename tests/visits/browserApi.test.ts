import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBrowserVisitApi, deliverVisitMessage, onSessionPage, setVisitTab } from '../../src/visits/browserApi';
import type { VisitMessage } from '../../src/visits/messages';

const msg: VisitMessage = { type: 'visitFound', found: null, frameUrl: 'https://www.aleks.com/x', top: true };

describe('finder message delivery', () => {
  afterEach(() => setVisitTab(null));

  it('takes messages from the visit tab and hands them to the runner', async () => {
    setVisitTab(5);
    expect(deliverVisitMessage(msg, { tab: { id: 5 } })).toBe(true);
    expect(await createBrowserVisitApi().nextMessage(5, 50)).toEqual(msg);
  });

  it('ignores messages from other tabs, and when no visit runs', async () => {
    setVisitTab(5);
    expect(deliverVisitMessage(msg, { tab: { id: 6 } })).toBe(false);
    expect(await createBrowserVisitApi().nextMessage(5, 20)).toBe('timeout');
    setVisitTab(null);
    expect(deliverVisitMessage(msg, { tab: { id: 5 } })).toBe(false);
  });

  it('resolves a waiting runner as soon as a message arrives', async () => {
    setVisitTab(5);
    const waiting = createBrowserVisitApi().nextMessage(5, 1000);
    deliverVisitMessage(msg, { tab: { id: 5 } });
    expect(await waiting).toEqual(msg);
  });
});

describe('visit window state', () => {
  const setup = async (created: object) => {
    const { browser } = await import('wxt/browser');
    const w = browser.windows as unknown as Record<string, unknown>;
    w.create = async () => ({ id: 1, tabs: [{ id: 5 }], state: 'minimized', focused: false });
    const api = createBrowserVisitApi();
    w.remove = async () => undefined;
    await api.closeWindow(1); // forget window 1 from an earlier test
    const at = (now: object) => (w.get = async () => ({ id: 1, tabs: [{}], ...now }));
    at(created); // how the window looks once it has settled (the run's first check)
    return { api, at, w };
  };

  it('refuses to create a visit window', async () => {
    const { api } = await setup({});
    await expect(api.openWindow()).rejects.toThrow('visit windows are disabled');
  });

  it('a window from an earlier run (no record of how it opened) counts as untouched only with a single tab', async () => {
    const { api, at } = await setup({});
    at({ id: 77, state: 'normal', focused: true, tabs: [{}] });
    expect(await api.windowState(77)).toBe('minimized');
    at({ id: 77, state: 'normal', focused: true, tabs: [{}, {}] });
    expect(await api.windowState(77)).toBe('open');
  });

  it('a closed window is gone', async () => {
    const { api, w } = await setup({});
    w.get = async () => {
      throw new Error('No window with id: 1');
    };
    expect(await api.windowState(1)).toBe('gone');
  });
});

describe('frames seen during a visit', () => {
  afterEach(() => setVisitTab(null));
  it('frame reports are collected for the log and are not taken as answers', async () => {
    setVisitTab(5);
    const api = createBrowserVisitApi();
    expect(deliverVisitMessage({ type: 'visitFrame', frameUrl: 'https://education.wiley.com/was/x', top: false }, { tab: { id: 5 } })).toBe(true);
    expect(await api.framesSeen(5)).toEqual(['https://education.wiley.com/was/x']);
    expect(await api.nextMessage(5, 20)).toBe('timeout');
  });
});

describe('buttons pressed during a visit', () => {
  afterEach(() => setVisitTab(null));
  it('are collected for the log and are not taken as answers', async () => {
    setVisitTab(5);
    const api = createBrowserVisitApi();
    expect(deliverVisitMessage({ type: 'visitClick', label: 'Open Assignment', frameUrl: 'https://education.wiley.com/l' }, { tab: { id: 5 } })).toBe(true);
    expect(await api.clicksSeen(5)).toEqual(['Open Assignment (education.wiley.com)']);
    expect(await api.nextMessage(5, 20)).toBe('timeout');
  });
});

describe('page samples during a visit', () => {
  afterEach(() => setVisitTab(null));
  it('are collected for the log', async () => {
    setVisitTab(5);
    const api = createBrowserVisitApi();
    deliverVisitMessage({ type: 'visitSample', frameUrl: 'https://education.wiley.com/l', text: 'Launching', buttons: ['Open'] }, { tab: { id: 5 } });
    expect(await api.samplesSeen(5)).toEqual([{ url: 'https://education.wiley.com/l', text: 'Launching', buttons: ['Open'] }]);
    expect(await api.nextMessage(5, 20)).toBe('timeout');
  });
});

describe('sessionDone', () => {
  it("Pearson: a MyLab page, not MyLab's launch address; others: their session host", async () => {
    const { sessionDone } = await import('../../src/visits/hosts');
    expect(sessionDone('pearson', 'https://mylab.pearson.com/Student/DoAssignments.aspx')).toBe(true);
    expect(sessionDone('pearson', 'https://mylab.pearson.com/api/v1/courses/1/links/assignments/launch')).toBe(false);
    expect(sessionDone('pearson', 'https://console.pearson.com/courses/c1/dashboard')).toBe(false);
    expect(sessionDone('gradescope', 'https://www.gradescope.com/account')).toBe(true);
    expect(sessionDone('aleks', 'https://www.aleks.com/x')).toBe(true);
  });
});

describe('onSessionPage', () => {
  it("is true on the session's page or a sign-in page, false on the steps before it", () => {
    expect(onSessionPage('https://mylab.pearson.com/Student/x', 'pearson')).toBe(true);
    expect(onSessionPage('https://login.purdue.edu/idp/profile/SAML2', 'pearson')).toBe(true);
    expect(onSessionPage('https://mylab.pearson.com/api/v1/courses/1/links/assignments/launch', 'pearson')).toBe(false);
    expect(onSessionPage('https://interop.pearson.com/security/login', 'pearson')).toBe(false);
    expect(onSessionPage('https://purdue.brightspace.com/d2l/lti/x', 'pearson')).toBe(false);
    expect(onSessionPage('about:blank', 'pearson')).toBe(false);
    expect(onSessionPage(undefined, 'pearson')).toBe(false);
  });
});

describe('injecting the first-connection reader', () => {
  it('still reads the top page when another embedded origin refuses injection', async () => {
    const { browser } = await import('wxt/browser');
    const execute = vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async (options) => {
      if (options.target.allFrames) throw new Error('Cannot access a third-party frame');
      return [];
    });
    try {
      await expect(createBrowserVisitApi().inject(7, 'session', 'pearson')).resolves.toBeUndefined();
      expect(execute.mock.calls.some(([options]) => !options.target.allFrames && options.files?.includes('/visit-finder.js'))).toBe(true);
    } finally { execute.mockRestore(); }
  });
});
