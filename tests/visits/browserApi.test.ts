import { describe, it, expect, afterEach } from 'vitest';
import { createBrowserVisitApi, deliverVisitMessage, setVisitTab } from '../../src/visits/browserApi';
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

  it('the student taking over the window is a change from how it looked at the first check', async () => {
    const { api, at } = await setup({ state: 'minimized', focused: false });
    await api.openWindow();
    expect(await api.windowState(1)).toBe('minimized');
    at({ state: 'minimized', focused: false });
    expect(await api.windowState(1)).toBe('minimized');
    at({ state: 'normal', focused: false });
    expect(await api.windowState(1)).toBe('open');
    at({ state: 'minimized', focused: true });
    expect(await api.windowState(1)).toBe('open');
    at({ state: 'minimized', focused: false, tabs: [{}, {}] });
    expect(await api.windowState(1)).toBe('open');
  });

  it('a system that could not minimize the window (it opened normal and focused, whatever create() echoed) does not stop the visits', async () => {
    const { api, at } = await setup({ state: 'minimized', focused: false });
    await api.openWindow();
    at({ state: 'normal', focused: true }); // the system restored and focused it on its own, before the first check
    expect(await api.windowState(1)).toBe('minimized');
    expect(await api.windowState(1)).toBe('minimized');
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
