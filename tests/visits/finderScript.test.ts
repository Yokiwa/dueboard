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
    await vi.advanceTimersByTimeAsync(11_000);
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
