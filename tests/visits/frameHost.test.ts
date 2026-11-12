import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFrameHost } from '../../src/visits/frame/host';
import type { FrameResult, FrameVisitRequest } from '../../src/visits/frame/protocol';

const ORIGIN = 'chrome-extension://abc123';
const n = (i: number) => i.toString(16).padStart(32, '0');
const found = { title: 'HW 7', dueAt: '2026-11-10T23:59:00.000Z', evidence: 'Due 11/10' };
const req = (o: Partial<FrameVisitRequest> = {}): FrameVisitRequest => ({ token: 't1', url: 'https://www.aleks.com/hw', mode: 'due', platform: 'aleks', titles: [{ key: 'k', title: 'HW 7' }], ...o });

type Win = { parent: unknown; postMessage: ReturnType<typeof vi.fn> };
const win = (parent: unknown): Win => ({ parent, postMessage: vi.fn() });

/**
 * The host's iframes live in a detached element: happy-dom prints a DOMException for every iframe it is asked to load
 * into the document, and these tests never need a page to load.
 */
const holder = document.createElement('div');
const fakeDoc = { createElement: (t: string) => document.createElement(t), body: holder, querySelectorAll: (s: string) => holder.querySelectorAll(s) } as unknown as Document;

function setup() {
  const host = createFrameHost(fakeDoc);
  const iframes = () => [...holder.querySelectorAll('iframe')] as HTMLIFrameElement[];
  /** Gives the iframe of the visit a fake window whose parent is the host window. */
  const child = (i = 0): Win => {
    const f = iframes()[i]!;
    const w = win(window);
    Object.defineProperty(f, 'contentWindow', { value: w, configurable: true });
    return w;
  };
  const hello = (source: unknown, nonce: string, origin = ORIGIN) => host.onPost({ data: { dueboard: 'hello', nonce }, source, origin });
  const send = (nonce: string, message: unknown) => host.onMessage({ type: 'frameMessage', nonce, message });
  const frame = (nonce: string, url: string, top = false) => send(nonce, { type: 'visitFrame', frameUrl: url, top });
  return { host, iframes, child, hello, send, frame };
}

describe('frame host', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    holder.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('adds one iframe with the url and a name, and removes it when the visit ends', async () => {
    const { host, iframes, child, hello, send } = setup();
    let result: FrameResult | undefined;
    const p = host.visit(req()).then((r) => (result = r));
    expect(iframes().length).toBe(1);
    expect(iframes()[0]!.src).toBe('https://www.aleks.com/hw');
    expect(iframes()[0]!.name).toBe('dueboard-t1');
    expect(iframes()[0]!.hasAttribute('sandbox')).toBe(false);
    hello(child(), n(1));
    send(n(1), { type: 'visitFound', found, frameUrl: 'https://www.aleks.com/hw', top: false });
    await p;
    expect(result!.status).toBe('found');
    expect(iframes().length).toBe(0);
  });

  it('binds a hello from the iframe window or a nested frame, answers with an ack, and ignores everything else', async () => {
    const { host, child, hello } = setup();
    void host.visit(req());
    const direct = child();
    const nested = win(win(direct));
    const stranger = win(win(window));
    hello(direct, n(1), ORIGIN);
    hello(nested, n(2), ORIGIN);
    hello(stranger, n(3));
    host.onPost({ data: { dueboard: 'hello', nonce: 'short' }, source: direct, origin: ORIGIN });
    host.onPost({ data: { dueboard: 'hi', nonce: n(4) }, source: direct, origin: ORIGIN });
    host.onPost({ data: null, source: direct, origin: ORIGIN });
    host.onPost({ data: { dueboard: 'hello', nonce: n(5) }, source: undefined, origin: ORIGIN });
    expect(direct.postMessage).toHaveBeenCalledWith({ dueboard: 'ack', nonce: n(1) }, ORIGIN);
    expect(nested.postMessage).toHaveBeenCalledWith({ dueboard: 'ack', nonce: n(2) }, ORIGIN);
    expect(stranger.postMessage).not.toHaveBeenCalled();
    expect(direct.postMessage).toHaveBeenCalledTimes(1);
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).not.toBeNull();
    expect(host.onMessage({ type: 'frameConfig', nonce: n(2) })).not.toBeNull();
    for (const nonce of [n(3), n(4), n(5), n(6), 'unknown']) expect(host.onMessage({ type: 'frameConfig', nonce })).toBeNull();
  });

  it('does not walk more than 10 levels to find the iframe', () => {
    const { host, child, hello } = setup();
    void host.visit(req());
    let w: Win = child();
    for (let i = 0; i < 10; i++) w = win(w);
    hello(w, n(1));
    expect(w.postMessage).not.toHaveBeenCalled();
    hello(win(win(child())), n(2));
  });

  it('does not rebind a nonce that is already bound', () => {
    const { host, child, hello } = setup();
    void host.visit(req());
    const w = child();
    hello(w, n(1));
    hello(w, n(1));
    expect(w.postMessage).toHaveBeenCalledTimes(1);
  });

  it('answers frameConfig for a bound nonce, undefined for other messages', () => {
    const { host, child, hello } = setup();
    void host.visit(req({ mode: 'due' }));
    hello(child(), n(1));
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).toEqual({ mode: 'due', platform: 'aleks', allowOpen: true, titles: [{ key: 'k', title: 'HW 7' }] });
    expect(host.onMessage({ type: 'sync' })).toBeUndefined();
    expect(host.onMessage('x')).toBeUndefined();
    expect(host.onMessage(null)).toBeUndefined();
  });

  it('allowOpen is false outside due mode', async () => {
    const { host, child, hello } = setup();
    void host.visit(req({ mode: 'syllabus', titles: undefined }));
    hello(child(), n(1));
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).toMatchObject({ mode: 'syllabus', allowOpen: false, titles: [] });
  });

  it('allowOpen is true on sign-in visits (Pearson opens MyLab from a link meant for a new tab)', () => {
    const { host, child, hello } = setup();
    void host.visit(req({ mode: 'session', platform: 'pearson', titles: undefined }));
    hello(child(), n(1));
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).toMatchObject({ mode: 'session', allowOpen: true });
  });

  it('ends blocked when no hello arrives in 20 s', async () => {
    const { host, iframes } = setup();
    const p = host.visit(req());
    await vi.advanceTimersByTimeAsync(19_999);
    expect(iframes().length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ status: 'blocked', listed: [], frames: [], clicked: [], pages: [] });
    expect(iframes().length).toBe(0);
  });

  it('honours helloMs and readMs from the request', async () => {
    const { host } = setup();
    const p = host.visit(req({ helloMs: 1_000 }));
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(p).resolves.toMatchObject({ status: 'blocked' });
  });

  it('ends blocked when only Brightspace pages answer, helloMs + readMs after the start', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    frame(n(1), 'https://purdue.brightspace.com/d2l/le/content/1');
    await vi.advanceTimersByTimeAsync(41_999);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toMatchObject({ status: 'blocked', frames: [{ url: 'https://purdue.brightspace.com/d2l/le/content/1', top: false }] });
  });

  it('ends signed_out when the direct child shows a sign-in page', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    frame(n(1), 'https://login.purdue.edu/idp/profile/SAML2');
    await expect(p).resolves.toMatchObject({ status: 'signed_out' });
  });

  it('ignores a sign-in page in a nested frame', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req());
    hello(win(child()), n(1));
    frame(n(1), 'https://login.purdue.edu/idp/profile/SAML2');
    await vi.advanceTimersByTimeAsync(42_000);
    await expect(p).resolves.toMatchObject({ status: 'blocked' });
  });

  it('found: ends at once with host and landed from the latest non-Brightspace direct frame', async () => {
    const { host, child, hello, frame, send } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    frame(n(1), 'https://purdue.brightspace.com/d2l/x');
    frame(n(1), 'https://www.aleks.com/a/b');
    frame(n(1), 'https://www.aleks.com/hw7');
    send(n(1), { type: 'visitFound', found, frameUrl: 'https://www.aleks.com/hw7', top: false });
    await expect(p).resolves.toMatchObject({ status: 'found', found, host: 'www.aleks.com', landed: 'https://www.aleks.com/hw7' });
  });

  it('found from a nested frame counts too, host from the direct child', async () => {
    const { host, child, hello, frame, send } = setup();
    const p = host.visit(req());
    const direct = child();
    hello(direct, n(1));
    hello(win(direct), n(2));
    frame(n(1), 'https://www.aleks.com/outer');
    send(n(2), { type: 'visitFound', found, frameUrl: 'https://cdn.aleks.com/inner', top: false });
    await expect(p).resolves.toMatchObject({ status: 'found', host: 'www.aleks.com', landed: 'https://www.aleks.com/outer' });
  });

  it('none: only an empty answer, readMs after the first non-Brightspace hello', async () => {
    const { host, child, hello, frame, send } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    await vi.advanceTimersByTimeAsync(5_000);
    frame(n(1), 'https://www.aleks.com/hw7');
    send(n(1), { type: 'visitFound', found: null, frameUrl: 'https://www.aleks.com/hw7', top: false });
    await vi.advanceTimersByTimeAsync(21_999);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toMatchObject({ status: 'none', host: 'www.aleks.com' });
  });

  it('session mode ends landed at the first non-Brightspace direct frame', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req({ mode: 'session' }));
    hello(child(), n(1));
    frame(n(1), 'https://purdue.brightspace.com/d2l/x');
    frame(n(1), 'https://www.aleks.com/hw7');
    await expect(p).resolves.toMatchObject({ status: 'landed', host: 'www.aleks.com', landed: 'https://www.aleks.com/hw7' });
  });

  it('reads the platform page Brightspace embeds in its launch page (a nested frame)', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req());
    const direct = child();
    hello(direct, n(1));
    hello(win(direct), n(2));
    frame(n(1), 'https://purdue.brightspace.com/d2l/lti/orgUnit/1/link/2/componentLaunch');
    frame(n(2), 'https://www.gradescope.com/courses/1');
    // The read window starts at the nested landing: readMs later the visit ends none, not blocked.
    await vi.advanceTimersByTimeAsync(22_000);
    await expect(p).resolves.toMatchObject({ status: 'none', host: 'www.gradescope.com', landed: 'https://www.gradescope.com/courses/1' });
  });

  it('a nested landing follows the embedded tool from page to page', async () => {
    const { host, child, hello, frame, send } = setup();
    const p = host.visit(req());
    const direct = child();
    hello(direct, n(1));
    hello(win(direct), n(2));
    hello(win(win(direct)), n(3));
    frame(n(1), 'https://purdue.brightspace.com/d2l/lti/x/componentLaunch');
    frame(n(2), 'https://lti.education.wiley.com/oidc/return');
    frame(n(3), 'https://education.wiley.com/was/player');
    send(n(3), { type: 'visitFound', found, frameUrl: 'https://education.wiley.com/was/player', top: false });
    await expect(p).resolves.toMatchObject({ status: 'found', host: 'education.wiley.com', landed: 'https://education.wiley.com/was/player' });
  });

  it('a platform page in the iframe itself wins over frames nested in it', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req());
    const direct = child();
    hello(direct, n(1));
    hello(win(direct), n(2));
    frame(n(1), 'https://www.aleks.com/hw7');
    frame(n(2), 'https://ads.example.com/banner');
    await vi.advanceTimersByTimeAsync(22_000);
    await expect(p).resolves.toMatchObject({ status: 'none', host: 'www.aleks.com', landed: 'https://www.aleks.com/hw7' });
  });

  it('session mode waits for the platform session host (Pearson: mylab.pearson.com), nested or not', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req({ mode: 'session', platform: 'pearson' }));
    const direct = child();
    hello(direct, n(1));
    hello(win(direct), n(2));
    frame(n(1), 'https://purdue.brightspace.com/d2l/lti/x/componentLaunch');
    frame(n(2), 'https://interop.pearson.com/security/login');
    frame(n(2), 'https://interop.pearson.com/launch');
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toBe(false);
    frame(n(2), 'https://mylab.pearson.com/Student/DoAssignments.aspx');
    await expect(p).resolves.toMatchObject({ status: 'landed', host: 'mylab.pearson.com' });
  });

  it('session mode that never reaches the session host ends blocked (the window tries next)', async () => {
    const { host, child, hello, frame } = setup();
    const p = host.visit(req({ mode: 'session', platform: 'pearson' }));
    hello(child(), n(1));
    frame(n(1), 'https://interop.pearson.com/security/login');
    await vi.advanceTimersByTimeAsync(42_000);
    await expect(p).resolves.toMatchObject({ status: 'blocked' });
  });

  it('syllabus mode ends with the text lines', async () => {
    const { host, child, hello, send } = setup();
    const p = host.visit(req({ mode: 'syllabus' }));
    hello(child(), n(1));
    send(n(1), { type: 'visitText', lines: ['Oct 14 | Exam 2'], frameUrl: 'https://x.edu/s' });
    await expect(p).resolves.toMatchObject({ status: 'text', lines: ['Oct 14 | Exam 2'] });
  });

  it('collects clicks, samples and listed titles', async () => {
    const { host, child, hello, frame, send } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    frame(n(1), 'https://www.aleks.com/hw7');
    send(n(1), { type: 'visitClick', label: 'Open', frameUrl: 'https://www.aleks.com/hw7' });
    send(n(1), { type: 'visitSample', frameUrl: 'https://www.aleks.com/hw7', text: 'hello', buttons: ['Open'] });
    send(n(1), { type: 'visitSample', frameUrl: 'https://www.aleks.com/hw7', text: 'hello 2', buttons: [] });
    send(n(1), { type: 'visitListed', listed: [{ key: 'k', found }] });
    send(n(1), { type: 'visitFound', found, frameUrl: 'https://www.aleks.com/hw7', top: false });
    await expect(p).resolves.toMatchObject({
      status: 'found',
      clicked: ['Open (www.aleks.com)'],
      pages: [{ url: 'https://www.aleks.com/hw7', text: 'hello 2', buttons: [] }],
      listed: [{ key: 'k', found }],
      frames: [{ url: 'https://www.aleks.com/hw7', top: false }],
    });
  });

  it('drops malformed messages and messages for unbound nonces', async () => {
    const { host, child, hello, send } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    send(n(9), { type: 'visitFound', found, frameUrl: 'https://www.aleks.com/hw7', top: false });
    send(n(1), { type: 'visitFound', found: { title: 1, dueAt: 'x', evidence: 'y' }, frameUrl: 'https://www.aleks.com/hw7', top: false });
    send(n(1), { type: 'visitFound', found, frameUrl: 5, top: false });
    send(n(1), { type: 'visitListed', listed: [{ key: 'k', found: { title: 'a' } }] });
    send(n(1), { type: 'visitListed', listed: 'x' });
    send(n(1), { type: 'visitText', lines: [1], frameUrl: 'u' });
    send(n(1), { type: 'whatever' });
    send(n(1), null);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toMatchObject({ status: 'blocked', listed: [], frames: [], clicked: [], pages: [] });
  });

  it('60 visits one after another leave no iframes', async () => {
    const { host, iframes, child, hello, send } = setup();
    for (let i = 0; i < 60; i++) {
      const p = host.visit(req({ token: `t${i}` }));
      hello(child(), n(i + 1));
      send(n(i + 1), { type: 'visitFound', found, frameUrl: 'https://www.aleks.com/hw', top: false });
      await p;
    }
    expect(iframes().length).toBe(0);
  });

  it('a nonce does not outlive its visit', async () => {
    const { host, child, hello } = setup();
    const p = host.visit(req());
    hello(child(), n(1));
    await vi.advanceTimersByTimeAsync(60_000);
    await p;
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).toBeNull();
  });

  it('reset removes iframes and resolves pending visits as blocked', async () => {
    const { host, iframes } = setup();
    const a = host.visit(req({ token: 'a' }));
    const b = host.visit(req({ token: 'b' }));
    const stray = document.createElement('iframe');
    stray.name = 'dueboard-stray';
    holder.appendChild(stray);
    expect(iframes().length).toBe(3);
    host.reset();
    await expect(a).resolves.toMatchObject({ status: 'blocked' });
    await expect(b).resolves.toMatchObject({ status: 'blocked' });
    expect(iframes().length).toBe(0);
  });

  it('ignores a hello from a sandboxed frame (origin null) without binding the nonce', () => {
    const { host, child, hello } = setup();
    void host.visit(req());
    const direct = child();
    hello(direct, n(1), 'null');
    expect(direct.postMessage).not.toHaveBeenCalled();
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).toBeNull();
    hello(direct, n(1), ORIGIN);
    expect(direct.postMessage).toHaveBeenCalledTimes(1);
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).not.toBeNull();
  });

  it('leaves no nonce bound when the ack cannot be posted', () => {
    const { host, child, hello } = setup();
    void host.visit(req());
    const direct = child();
    direct.postMessage.mockImplementationOnce(() => {
      throw new Error('detached');
    });
    expect(() => hello(direct, n(1))).not.toThrow();
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).toBeNull();
    hello(direct, n(1));
    expect(host.onMessage({ type: 'frameConfig', nonce: n(1) })).not.toBeNull();
  });
});
