import { describe, it, expect, vi } from 'vitest';
import { inExtensionFrame, installOpenHere } from '../../src/visits/frame/openHere';

type FakeWin = {
  top: unknown;
  open: (u?: string | URL, t?: string) => unknown;
  location: { assign: ReturnType<typeof vi.fn>; ancestorOrigins?: ArrayLike<string> };
  __dueboardOpenHere?: boolean;
};

const fake = (): FakeWin => {
  const w: FakeWin = { top: {}, open: () => null, location: { assign: vi.fn() } };
  return w;
};

describe('open here', () => {
  it('a new-tab open with an address loads it in this frame', () => {
    const w = fake();
    installOpenHere(w as unknown as Window);
    const r = w.open('https://education.wiley.com/was/player', '_blank');
    expect(w.location.assign).toHaveBeenCalledWith('https://education.wiley.com/was/player');
    expect(r).not.toBeNull();
  });

  it('an empty window whose address is set afterwards loads that address here', () => {
    const w = fake();
    installOpenHere(w as unknown as Window);
    const a = w.open('', '_blank') as { location: unknown };
    a.location = 'https://education.wiley.com/a';
    const b = w.open() as { location: { href: string } };
    b.location.href = 'https://education.wiley.com/b';
    const c = w.open('about:blank') as { location: { replace(u: string): void; assign(u: string): void } };
    c.location.replace('https://education.wiley.com/c');
    expect(w.location.assign.mock.calls.map((x) => x[0])).toEqual(['https://education.wiley.com/a', 'https://education.wiley.com/b', 'https://education.wiley.com/c']);
  });

  it('the stand-in window takes the calls pages make on a popup', () => {
    const w = fake();
    installOpenHere(w as unknown as Window);
    const p = w.open('') as { focus(): void; close(): void; closed: boolean; document: { write(s: string): void; close(): void } };
    expect(() => {
      p.focus();
      p.document.write('<p>Loading…</p>');
      p.document.close();
      p.close();
    }).not.toThrow();
    expect(p.closed).toBe(false);
    expect(w.location.assign).not.toHaveBeenCalled();
  });

  it('installs once', () => {
    const w = fake();
    installOpenHere(w as unknown as Window);
    const first = w.open;
    installOpenHere(w as unknown as Window);
    expect(w.open).toBe(first);
  });

  it('inExtensionFrame: only a nested frame whose top page is an extension page', () => {
    const w = fake();
    w.location.ancestorOrigins = ['https://purdue.brightspace.com', 'chrome-extension://abc'];
    expect(inExtensionFrame(w as unknown as Window)).toBe(true);
    w.location.ancestorOrigins = ['https://purdue.brightspace.com'];
    expect(inExtensionFrame(w as unknown as Window)).toBe(false);
    w.location.ancestorOrigins = [];
    expect(inExtensionFrame(w as unknown as Window)).toBe(false);
    delete w.location.ancestorOrigins;
    expect(inExtensionFrame(w as unknown as Window)).toBe(false);
    const topWin = fake();
    topWin.top = topWin;
    topWin.location.ancestorOrigins = ['chrome-extension://abc'];
    expect(inExtensionFrame(topWin as unknown as Window)).toBe(false);
  });
});
