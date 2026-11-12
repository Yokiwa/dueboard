import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startFrameReader } from '../../src/visits/frame/reader';
import { isHelloPost, isReaderMessage, type FrameConfig, type HelloPost, type ReaderMessage } from '../../src/visits/frame/protocol';

const ORIGIN = 'chrome-extension://abc123';
const OPEN_HERE = 'chrome-extension://abc123/open-here.js';

function setup(opts: { top: boolean; config: FrameConfig | null; ancestorOrigins?: string[]; ack?: boolean }) {
  const post = vi.fn<(m: HelloPost, origin: string) => void>();
  const sent: ReaderMessage[] = [];
  const listeners = new Set<(e: MessageEvent) => void>();
  const location: { href: string; ancestorOrigins?: string[] } = { href: 'https://www.aleks.com/hw7' };
  if (opts.ancestorOrigins) location.ancestorOrigins = opts.ancestorOrigins;
  const topObj = { postMessage: post };
  const win = {
    document,
    location,
    addEventListener: (_t: string, l: (e: MessageEvent) => void) => void listeners.add(l),
    removeEventListener: (_t: string, l: (e: MessageEvent) => void) => void listeners.delete(l),
  } as unknown as Window & { top: unknown };
  (win as { top: unknown }).top = opts.top ? win : topObj;
  const send = vi.fn(async (m: ReaderMessage) => {
    sent.push(m);
    return m.type === 'frameConfig' ? opts.config : undefined;
  });
  startFrameReader(win, { extensionOrigin: ORIGIN, send, openHereUrl: OPEN_HERE });
  /** Delivers a message event to the window, by default a valid ack for the hello that was posted. */
  const deliver = (o: { source?: unknown; origin?: string; data?: unknown } = {}) => {
    const nonce = post.mock.calls[0]?.[0].nonce;
    const e = { source: 'source' in o ? o.source : topObj, origin: o.origin ?? ORIGIN, data: 'data' in o ? o.data : { dueboard: 'ack', nonce } } as MessageEvent;
    for (const l of [...listeners]) l(e);
  };
  if (opts.ack !== false && !opts.top) deliver();
  return { win, post, sent, send, deliver, listeners, topObj };
}

describe('frame reader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.head.innerHTML = '';
    document.body.innerHTML = '<h1>HW 7</h1><p>Due Date: 11/10/2026 11:59 PM</p>';
  });
  // happy-dom refuses to load script files and prints a DOMException for each one; the tests look at what was appended.
  let appended: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    appended = vi.spyOn(document.head, 'appendChild').mockImplementation(((n: Node) => n) as never);
  });
  afterEach(() => {
    appended.mockRestore();
    vi.useRealTimers();
  });

  it('does nothing in a normal tab', async () => {
    const before = document.documentElement.outerHTML;
    const { post, send } = setup({ top: true, config: { mode: 'due', allowOpen: true, titles: [] } });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(post).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('stays silent in a nested frame of a website that never acks', async () => {
    const before = document.documentElement.outerHTML;
    const { send, listeners } = setup({ top: false, config: { mode: 'due', allowOpen: true, titles: [] }, ack: false });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(send).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('posts no hello when the top page is a website (ancestorOrigins)', async () => {
    const { post, send } = setup({ top: false, config: null, ancestorOrigins: ['https://purdue.brightspace.com'], ack: false });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(post).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('posts the hello when the last ancestor origin is the extension', async () => {
    const { post } = setup({ top: false, config: null, ancestorOrigins: [ORIGIN], ack: false });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ignores an ack with the wrong nonce, source or origin', async () => {
    const { send, deliver } = setup({ top: false, config: null, ack: false });
    deliver({ data: { dueboard: 'ack', nonce: '0'.repeat(32) } });
    deliver({ source: {} });
    deliver({ origin: 'https://evil.example' });
    deliver({ data: { dueboard: 'hello', nonce: '0'.repeat(32) } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('posts one hello with a 32 hex nonce to exactly the extension origin', async () => {
    const { post } = setup({ top: false, config: null });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(post).toHaveBeenCalledTimes(1);
    const [msg, origin] = post.mock.calls[0]!;
    expect(origin).toBe(ORIGIN);
    expect(isHelloPost(msg)).toBe(true);
    expect(msg.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(Object.keys(msg).sort()).toEqual(['dueboard', 'nonce']);
  });

  it('asks for the config every 250 ms for at most 5 s, then stops', async () => {
    const { sent, post } = setup({ top: false, config: null });
    const nonce = post.mock.calls[0]![0].nonce;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent.length).toBeGreaterThanOrEqual(19);
    expect(sent.length).toBeLessThanOrEqual(21);
    for (const m of sent) {
      expect(m).toEqual({ type: 'frameConfig', nonce });
      expect(isReaderMessage(m)).toBe(true);
    }
    const n = sent.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent.length).toBe(n);
  });

  it('runs the finder with the config and reports through send', async () => {
    const { sent, post, win } = setup({ top: false, config: { mode: 'due', platform: 'aleks', allowOpen: false, titles: [{ key: 'k', title: 'HW 7' }] } });
    const nonce = post.mock.calls[0]![0].nonce;
    await vi.advanceTimersByTimeAsync(1_000);
    const msgs = sent.filter((m) => m.type === 'frameMessage') as Extract<ReaderMessage, { type: 'frameMessage' }>[];
    expect(msgs.every((m) => m.nonce === nonce)).toBe(true);
    expect(msgs[0]!.message).toMatchObject({ type: 'visitFrame', top: false });
    expect(msgs[1]!.message).toMatchObject({ type: 'visitFound', found: { dueAt: new Date(2026, 10, 10, 23, 59).toISOString() } });
    expect((win as unknown as { __dueboardTitles: unknown }).__dueboardTitles).toEqual([{ key: 'k', title: 'HW 7' }]);
    expect((win as unknown as { __dueboardPlatform: unknown }).__dueboardPlatform).toBe('aleks');
  });

  it('session mode only says hello', async () => {
    const { sent } = setup({ top: false, config: { mode: 'session', allowOpen: false, titles: [] } });
    await vi.advanceTimersByTimeAsync(20_000);
    const msgs = sent.filter((m) => m.type === 'frameMessage') as Extract<ReaderMessage, { type: 'frameMessage' }>[];
    expect(msgs.map((m) => m.message.type)).toEqual(['visitFrame']);
  });

  it('adds the open-here script once when allowOpen, never otherwise', async () => {
    setup({ top: false, config: { mode: 'due', allowOpen: true, titles: [] } });
    await vi.advanceTimersByTimeAsync(1_000);
    const scripts = () => appended.mock.calls.map((c: unknown[]) => c[0] as HTMLScriptElement).filter((n: HTMLScriptElement) => n.tagName === 'SCRIPT');
    expect(scripts().map((n: HTMLScriptElement) => n.getAttribute('src'))).toEqual([OPEN_HERE]);
    appended.mockClear();
    setup({ top: false, config: { mode: 'due', allowOpen: false, titles: [] } });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(scripts().length).toBe(0);
  });
});
