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

describe('open here: forms and links meant for another window', () => {
  /** A window with the real document and a form class whose submit is a spy (no navigation in tests). */
  const setup = () => {
    const submitted: string[] = [];
    class Form {}
    (Form.prototype as { submit: () => void; requestSubmit: () => void }).submit = function (this: HTMLFormElement) {
      submitted.push(`submit:${this.getAttribute('target') ?? ''}`);
    };
    (Form.prototype as { requestSubmit: () => void }).requestSubmit = function (this: HTMLFormElement) {
      submitted.push(`request:${this.getAttribute('target') ?? ''}`);
    };
    const w = { ...fake(), document, HTMLFormElement: Form };
    installOpenHere(w as unknown as Window);
    const submit = (Form.prototype as { submit: () => void }).submit;
    const request = (Form.prototype as { requestSubmit: () => void }).requestSubmit;
    return { submitted, submit, request };
  };

  it('a form sent to a new window (or to the top page) is sent here', () => {
    const { submitted, submit, request } = setup();
    document.body.innerHTML = '<form id="a" target="_blank"></form><form id="b" target="_top"></form><form id="c" target="tool_window"></form>';
    for (const id of ['a', 'b']) submit.call(document.getElementById(id));
    request.call(document.getElementById('c'));
    expect(submitted).toEqual(['submit:_self', 'submit:_self', 'request:_self']);
  });

  it('a form sent to a frame of the page keeps its target', () => {
    const { submitted, submit } = setup();
    document.body.innerHTML = '<form id="a" target="lti_frame"></form><iframe name="lti_frame"></iframe><form id="b"></form>';
    submit.call(document.getElementById('a'));
    submit.call(document.getElementById('b'));
    expect(submitted).toEqual(['submit:lti_frame', 'submit:']);
  });

  it('a submit event and a link click are sent here too', () => {
    setup();
    document.body.innerHTML = '<form id="f" target="_blank"><button id="s">Go</button></form><a id="l" href="#x" target="_blank"><span id="in">Open</span></a>';
    document.getElementById('f')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.getElementById('f')!.getAttribute('target')).toBe('_self');
    document.getElementById('in')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.getElementById('l')!.getAttribute('target')).toBe('_self');
  });
});

describe('open here: links clicked by a script', () => {
  const setup = () => {
    const opened: string[] = [];
    class Anchor {}
    (Anchor.prototype as { click: () => void }).click = function (this: HTMLAnchorElement) {
      opened.push(`click:${this.getAttribute('target') ?? ''}`);
    };
    class Target {}
    (Target.prototype as { dispatchEvent: (e: Event) => boolean }).dispatchEvent = function (this: HTMLAnchorElement, e: Event) {
      opened.push(`${e.type}:${this.getAttribute('target') ?? ''}`);
      return true;
    };
    const w = { ...fake(), document, HTMLAnchorElement: Anchor, EventTarget: Target };
    installOpenHere(w as unknown as Window);
    return { opened, click: (Anchor.prototype as { click: () => void }).click, dispatch: (Target.prototype as { dispatchEvent: (e: Event) => boolean }).dispatchEvent };
  };

  it('a link the page never added, clicked by its script, opens here', () => {
    const { opened, click } = setup();
    const a = document.createElement('a');
    a.href = 'https://integration-hub.macmillanlearning.com/x';
    a.target = '_blank';
    click.call(a);
    expect(opened).toEqual(['click:_self']);
  });

  it('a click event sent to such a link opens here too; other events and elements are left alone', () => {
    const { opened, dispatch } = setup();
    const a = document.createElement('a');
    a.target = '_blank';
    dispatch.call(a, new MouseEvent('click'));
    const b = document.createElement('a');
    b.target = '_blank';
    dispatch.call(b, new Event('focus'));
    dispatch.call(document.createElement('div'), new MouseEvent('click'));
    expect(opened).toEqual(['click:_self', 'focus:_blank', 'click:']);
  });

  it('a link inside a web component (shadow DOM) clicked by the student-facing code opens here', () => {
    setup();
    const host = document.createElement('div');
    document.body.innerHTML = '';
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<a id="l" href="#y" target="_blank"><span>Launch</span></a>';
    root.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
    expect(root.getElementById('l')!.getAttribute('target')).toBe('_self');
  });
});
