import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFinder, type FinderWindow } from '../../src/visits/finders/run';
import type { VisitMessage } from '../../src/visits/messages';

/** The answers a frame sends (its "I'm here" report is checked separately). */
const answers = (sent: VisitMessage[]) => sent.filter((m) => m.type === 'visitFound' || m.type === 'visitText');
const fakeWindow = (top: boolean, mode: 'due' | 'syllabus' = 'due', platform?: string): FinderWindow => {
  const w = { document, location: { href: 'https://www.aleks.com/hw7' }, __dueboardMode: mode, __dueboardPlatform: platform } as FinderWindow;
  w.top = top ? w : ({} as FinderWindow);
  return w;
};

describe('runFinder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.body.innerHTML = '<h1>Homework 7</h1><div id="meta"></div>';
  });
  afterEach(() => vi.useRealTimers());

  it('reports a due date that renders late, once', async () => {
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1000);
    document.getElementById('meta')!.textContent = 'Due Date: 11/10/2026 11:59 PM';
    await vi.advanceTimersByTimeAsync(12_000);
    expect(answers(sent)).toEqual([
      { type: 'visitFound', found: { title: 'Homework 7', dueAt: new Date(2026, 10, 10, 23, 59).toISOString(), evidence: 'Due Date: 11/10/2026 11:59 PM' }, frameUrl: 'https://www.aleks.com/hw7', top: true },
    ]);
  });

  it('the top frame reports "nothing found" at the time limit', async () => {
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(answers(sent)).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(answers(sent)).toEqual([{ type: 'visitFound', found: null, frameUrl: 'https://www.aleks.com/hw7', top: true }]);
  });

  it('a non-top frame stays silent when it finds nothing', async () => {
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(false), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(answers(sent)).toEqual([]);
  });

  it('syllabus mode sends page lines once the text settles', async () => {
    document.body.innerHTML = '<table><tr><td>Oct 14</td><td>Exam 2</td></tr></table>';
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true, 'syllabus'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(answers(sent)).toEqual([{ type: 'visitText', lines: ['Oct 14 | Exam 2'], frameUrl: 'https://www.aleks.com/hw7' }]);
  });
});

describe('runFinder injected again into the same frame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.body.innerHTML = '<h1>Homework 7</h1><p>Due Date: 11/10/2026 11:59 PM</p>';
  });
  afterEach(() => vi.useRealTimers());

  it('a frame that is already reading ignores the second injection', async () => {
    const sent: VisitMessage[] = [];
    const w = fakeWindow(true);
    runFinder(w, (m) => sent.push(m));
    runFinder(w, (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1000);
    expect(answers(sent)).toHaveLength(1);
  });
});

describe('runFinder says which frames loaded (for the visit log)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<h1>Homework 7</h1>';
  });
  afterEach(() => vi.useRealTimers());

  it('each frame first reports that it is there, without the address details after "?"', async () => {
    const sent: VisitMessage[] = [];
    const w = fakeWindow(false);
    w.location = { href: 'https://education.wiley.com/was/ui/v2/assessment-player/index.html?launchId=SECRET#/main' };
    runFinder(w, (m) => sent.push(m));
    expect(sent[0]).toEqual({ type: 'visitFrame', frameUrl: 'https://education.wiley.com/was/ui/v2/assessment-player/index.html', top: false });
  });
});

describe('runFinder presses "open the assignment" when allowed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  const launcher = (href: string, allowOpen = true) => {
    const w = fakeWindow(true);
    w.location = { href };
    (w as FinderWindow & { __dueboardAllowOpen?: boolean }).__dueboardAllowOpen = allowOpen;
    return w;
  };
  const clicks = (sent: VisitMessage[]) => sent.filter((m) => m.type === 'visitClick');

  it('on a platform page still without a date after 4 s, presses it once and says so', async () => {
    document.body.innerHTML = '<h1>Assignment</h1><button id="b">Open Assignment</button>';
    let pressed = 0;
    document.getElementById('b')!.addEventListener('click', () => pressed++);
    const sent: VisitMessage[] = [];
    runFinder(launcher('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pressed).toBe(0);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(pressed).toBe(1);
    expect(clicks(sent)).toEqual([{ type: 'visitClick', label: 'Open Assignment', frameUrl: 'https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html' }]);
  });

  it('never presses on a Brightspace page', async () => {
    document.body.innerHTML = '<button>Open in New Window</button>';
    const sent: VisitMessage[] = [];
    runFinder(launcher('https://purdue.brightspace.com/d2l/le/content/1/viewContent/2/View'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(clicks(sent)).toEqual([]);
  });

  it('never presses when the date is already there, or when the visit does not allow it', async () => {
    document.body.innerHTML = '<h1>HW</h1><p>Due Nov 20 11:59 PM</p><button>Open Assignment</button>';
    const sent: VisitMessage[] = [];
    runFinder(launcher('https://education.wiley.com/a'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(clicks(sent)).toEqual([]);
    document.body.innerHTML = '<button>Open Assignment</button>';
    const sent2: VisitMessage[] = [];
    runFinder(launcher('https://education.wiley.com/b', false), (m) => sent2.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(clicks(sent2)).toEqual([]);
  });
});

describe('runFinder describes a page it found nothing on (for the visit log)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('at the time limit, each frame sends a short sample of its text and its buttons', async () => {
    document.body.innerHTML = '<h1>Launching your assignment</h1><p>Your instructor set this to open in a new window.</p><button>Start</button><a href="#">Help</a>';
    const sent: VisitMessage[] = [];
    const w = fakeWindow(false);
    w.location = { href: 'https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=X' };
    runFinder(w, (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(sent.filter((m) => m.type === 'visitSample')).toEqual([
      {
        type: 'visitSample',
        frameUrl: 'https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html',
        text: 'Launching your assignment / Your instructor set this to open in a new window. / Start Help',
        buttons: ['Start', 'Help'],
      },
    ]);
  });
});

describe('runFinder on a sign-in visit (session mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  const session = (href: string, platform = 'pearson') => {
    const w = fakeWindow(false);
    w.__dueboardMode = 'session';
    w.__dueboardPlatform = platform;
    w.location = { href };
    return w;
  };
  const clicks = (sent: VisitMessage[]) => sent.filter((m) => m.type === 'visitClick');

  it("Pearson's Brightspace page: presses Assignments (the step that signs in to MyLab), once, as soon as it shows", async () => {
    document.body.innerHTML = '<h1>Access Pearson for D2L Brightspace</h1><button>Open</button><a href="https://mylab.pearson.com/x" target="_blank">Assignments</a><a href="#">Results</a><a href="#">eTextbook</a>';
    let pressed = 0;
    const a = document.querySelector('a')!;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      pressed++;
    });
    const sent: VisitMessage[] = [];
    runFinder(session('https://interop.pearson.com/launch'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(pressed).toBe(1);
    expect(a.getAttribute('target')).toBe('_self');
    expect(clicks(sent)).toEqual([{ type: 'visitClick', label: 'Assignments', frameUrl: 'https://interop.pearson.com/launch' }]);
  });

  it('opens the Pearson gateway once, including when its accessible label describes a new tab', async () => {
    document.body.innerHTML = '<p>Loading Pearson content. Please wait.</p>';
    const sent: VisitMessage[] = [];
    runFinder(session('https://socket.pearsoned.com/uiservice/opener'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(2_000);
    document.body.innerHTML = '<a id="gateway" href="https://console.pearson.com/courses/1/dashboard" target="_blank" aria-label="Open Pearson (opens in new tab)"><span>Open Pearson</span></a>';
    const gateway = document.getElementById('gateway')!;
    let pressed = 0;
    gateway.addEventListener('click', (e) => { e.preventDefault(); pressed++; });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(pressed).toBe(1);
    expect(gateway.getAttribute('target')).toBe('_self');
    expect(clicks(sent)).toEqual([{ type: 'visitClick', label: 'Open Pearson (opens in new tab)', frameUrl: 'https://socket.pearsoned.com/uiservice/opener' }]);
  });

  it.each([
    ['https://console.pearson.com/courses/1/dashboard', 'pearson', 'Open Pearson'],
    ['https://socket.pearsoned.com/unrelated', 'pearson', 'Open Pearson'],
    ['https://socket.pearsoned.com/uiservice/opener', 'gradescope', 'Open Pearson'],
    ['https://socket.pearsoned.com/uiservice/opener', 'pearson', 'Open Pearson and submit'],
    ['https://socket.pearsoned.com/uiservice/opener', 'pearson', 'Open Pearson account settings'],
  ])('never treats an unrelated action as the gateway: %s %s %s', async (url, platform, label) => {
    document.body.innerHTML = `<button>${label}</button>`;
    const sent: VisitMessage[] = [];
    runFinder(session(url, platform), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(40_000);
    expect(clicks(sent)).toEqual([]);
  });

  it('also finds it by its accessible name', async () => {
    document.body.innerHTML = '<a href="#" aria-label="Assignments, opens in a new window"><span>Assignments</span><svg></svg></a>';
    const sent: VisitMessage[] = [];
    runFinder(session('https://interop.pearson.com/launch'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(clicks(sent).length).toBe(1);
  });

  it('waits for the page to show the link', async () => {
    document.body.innerHTML = '<p>Loading…</p>';
    const sent: VisitMessage[] = [];
    runFinder(session('https://interop.pearson.com/launch'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(3_000);
    document.body.innerHTML = '<button id="b">Assignments</button>';
    let pressed = 0;
    document.getElementById('b')!.addEventListener('click', () => pressed++);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(pressed).toBe(1);
  });

  it('presses nothing on MyLab itself, on another platform, or on a longer label', async () => {
    for (const [html, href, platform] of [
      ['<a href="#">Assignments</a>', 'https://mylab.pearson.com/Student/DoAssignments.aspx', 'pearson'],
      ['<a href="#">Assignments</a>', 'https://www.gradescope.com/courses/1', 'gradescope'],
      ['<button>All Assignments</button><button>Submit Assignments</button><a href="#">Assignments due this week</a>', 'https://interop.pearson.com/launch', 'pearson'],
    ] as const) {
      document.body.innerHTML = html;
      const sent: VisitMessage[] = [];
      runFinder(session(href, platform), (m) => sent.push(m));
      await vi.advanceTimersByTimeAsync(11_000);
      expect(clicks(sent)).toEqual([]);
    }
  });
});

describe('runFinder in a hidden frame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.body.innerHTML = '<h1>Project 1</h1><p>No submission yet.</p>';
  });
  afterEach(() => vi.useRealTimers());

  it("a frame of DueBoard's hidden frames says nothing-here at the end like a top page does; a nested frame of a tab does not", async () => {
    const sent: VisitMessage[] = [];
    const w = fakeWindow(false) as FinderWindow & { __dueboardInFrame?: boolean };
    w.__dueboardInFrame = true;
    runFinder(w, (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(answers(sent)).toEqual([{ type: 'visitFound', found: null, frameUrl: 'https://www.aleks.com/hw7', top: false }]);
    const sent2: VisitMessage[] = [];
    runFinder(fakeWindow(false), (m) => sent2.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(answers(sent2)).toEqual([]);
  });
});

describe('runFinder on a sign-in visit that does not find its link', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps looking for 35 s (a slow page), then describes the page for the visit log', async () => {
    document.body.innerHTML = '<h1>Loading your course</h1>';
    const w = fakeWindow(false);
    w.__dueboardMode = 'session';
    w.__dueboardPlatform = 'pearson';
    w.location = { href: 'https://interop.pearson.com/launch?token=SECRET' };
    const sent: VisitMessage[] = [];
    runFinder(w, (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(20_000);
    document.body.innerHTML = '<h1>Access Pearson for D2L Brightspace</h1><a id="a" href="#">Assignments</a>';
    let pressed = 0;
    document.getElementById('a')!.addEventListener('click', (e) => {
      e.preventDefault();
      pressed++;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(pressed).toBe(1);

    document.body.innerHTML = '<h1>Something went wrong</h1><button>Try again</button>';
    const w2 = fakeWindow(false);
    w2.__dueboardMode = 'session';
    w2.__dueboardPlatform = 'pearson';
    w2.location = { href: 'https://interop.pearson.com/launch?token=SECRET' };
    const sent2: VisitMessage[] = [];
    runFinder(w2, (m) => sent2.push(m));
    await vi.advanceTimersByTimeAsync(36_000);
    expect(sent2.filter((m) => m.type === 'visitSample')).toEqual([{ type: 'visitSample', frameUrl: 'https://interop.pearson.com/launch', text: 'Something went wrong / Try again', buttons: ['Try again'] }]);
  });
});

describe('runFinder reads whether the work is done (check mode)', () => {
  const checkWindow = (href = 'https://www.aleks.com/hw7', top = true): FinderWindow => {
    const w = { document, location: { href }, __dueboardMode: 'check', __dueboardPlatform: 'ALEKS' } as FinderWindow;
    w.top = top ? w : ({} as FinderWindow);
    return w;
  };
  const checks = (sent: VisitMessage[]) => sent.filter((m) => m.type === 'visitCheck' || m.type === 'visitFound');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    document.body.innerHTML = '<h1>Homework 7</h1><div id="meta"></div>';
  });
  afterEach(() => vi.useRealTimers());

  it('in check mode a page with "Score: 18/25" sends visitCheck at once', async () => {
    const sent: VisitMessage[] = [];
    runFinder(checkWindow(), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(1000);
    document.getElementById('meta')!.textContent = 'Score: 18/25';
    await vi.advanceTimersByTimeAsync(600);
    const got = checks(sent);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: 'visitCheck', check: { state: 'done', by: 'score', source: 'ALEKS', score: { earned: 18, possible: 25 } }, frameUrl: 'https://www.aleks.com/hw7', top: true });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(checks(sent)).toHaveLength(1);
  });

  it('a page with nothing sends visitCheck null at the time limit with a sample', async () => {
    const sent: VisitMessage[] = [];
    runFinder(checkWindow(), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(checks(sent)).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(checks(sent)).toEqual([{ type: 'visitCheck', check: null, frameUrl: 'https://www.aleks.com/hw7', top: true }]);
    expect(sent.some((m) => m.type === 'visitSample')).toBe(true);
  });

  it('check mode never reads a date (no visitFound)', async () => {
    document.getElementById('meta')!.textContent = 'Due Date: 11/10/2026 11:59 PM';
    const sent: VisitMessage[] = [];
    runFinder(checkWindow(), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(sent.some((m) => m.type === 'visitFound')).toBe(false);
  });

  it('Brightspace pages are never read for completion (its topics say "Completed" once viewed)', async () => {
    document.body.innerHTML = '<h1>Homework 7</h1><span>Completed</span>';
    const sent: VisitMessage[] = [];
    runFinder(checkWindow('https://purdue.brightspace.com/d2l/le/content/1/viewContent/2/View'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(11_000);
    expect(checks(sent)).toEqual([{ type: 'visitCheck', check: null, frameUrl: 'https://purdue.brightspace.com/d2l/le/content/1/viewContent/2/View', top: true }]);
  });

  it('a due-mode visitFound carries the check when the page shows one', async () => {
    document.getElementById('meta')!.innerHTML = '<p>Due Date: 11/10/2026 11:59 PM</p><p>Score: 18/25</p>';
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true, 'due', 'ALEKS'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(600);
    const found = sent.find((m) => m.type === 'visitFound');
    expect(found).toMatchObject({ type: 'visitFound', check: { state: 'done', by: 'score', source: 'ALEKS' } });
  });

  it('a due-mode visitFound has no check when the page shows none', async () => {
    document.getElementById('meta')!.textContent = 'Due Date: 11/10/2026 11:59 PM';
    const sent: VisitMessage[] = [];
    runFinder(fakeWindow(true, 'due', 'ALEKS'), (m) => sent.push(m));
    await vi.advanceTimersByTimeAsync(600);
    const found = sent.find((m) => m.type === 'visitFound') as { check?: unknown };
    expect(found).toBeDefined();
    expect('check' in found).toBe(false);
  });
});

describe('Pearson first-sync readiness', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<h1>Loading…</h1>'; });
  afterEach(() => vi.useRealTimers());
  const session = () => ({ document, location: { href: 'https://mylab.pearson.com/Student/DoAssignments.aspx?view=all' }, top: {}, __dueboardMode: 'session', __dueboardPlatform: 'pearson' }) as FinderWindow;
  it('waits for the assignment table rather than stopping when MyLab loads its shell', async () => {
    const sent: VisitMessage[] = [];
    runFinder(session(), (message) => sent.push(message));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(sent.some((message) => message.type === 'visitSessionReady')).toBe(false);
    document.body.innerHTML = '<script>const courseId = "ignore"</script><table class="assignement-list-table"><tr><td><div>11/10/26<br>11:59pm</div></td><th scope="row"><a href="javascript:doHomework(123)">HW 1</a></th></tr></table>';
    await vi.advanceTimersByTimeAsync(2_000);
    const ready = sent.find((message) => message.type === 'visitSessionReady');
    expect(ready).toMatchObject({ type: 'visitSessionReady' });
    if (ready?.type === 'visitSessionReady') {
      expect(ready.html).toContain('HW 1');
      expect(ready.html).not.toContain('<script');
    }
  });
  it('opens the full assignment list in the same frame when MyLab lands on its home page', () => {
    const win = session();
    win.location.href = 'https://mylab.pearson.com/Student/Home.aspx';
    runFinder(win, () => undefined);
    expect(win.location.href).toBe('https://mylab.pearson.com/Student/DoAssignments.aspx?view=all');
  });
});
