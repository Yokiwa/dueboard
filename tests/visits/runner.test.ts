import { describe, it, expect } from 'vitest';
import { closeLeftover, launchTargetHost, runVisits, type Landing, type VisitApi } from '../../src/visits/runner';
import type { VisitTarget } from '../../src/visits/schedule';
import type { VisitMessage } from '../../src/visits/messages';

const B = 'https://purdue.brightspace.com';
const target = (n: number, mode: VisitTarget['mode'] = 'due'): VisitTarget => ({ key: `brightspace:topic:${n}`, title: `HW ${n}`, courseId: 'brightspace:1', launchUrl: `${B}/launch/${n}`, mode });
const found = (n: number): VisitMessage => ({ type: 'visitFound', found: { title: `HW ${n}`, dueAt: `2026-11-1${n}T04:59:00.000Z`, evidence: `Due Nov 1${n}` }, frameUrl: 'https://www.aleks.com/x', top: true });

interface Script {
  landings?: Landing[];
  messages?: (VisitMessage | 'timeout')[];
  hosts?: (string | null | 'signed_out' | { host: string | null | 'signed_out'; note?: string })[];
  granted?: string[];
  injectThrows?: boolean;
  navigateThrows?: boolean;
  closeThrows?: boolean;
  tick?: number;
  /** Window state reported before each visit, in order (default: minimized). */
  states?: ('minimized' | 'open' | 'gone')[];
  signedIn?: boolean;
}
function fakeApi(s: Script) {
  const calls: string[] = [];
  let clock = 0;
  const landings = [...(s.landings ?? [])];
  const messages = [...(s.messages ?? [])];
  const hosts = [...(s.hosts ?? [])];
  const api: VisitApi = {
    openWindow: async () => {
      calls.push('open');
      return { windowId: 9, tabId: 5 };
    },
    navigate: async (_tab, url) => {
      calls.push(`navigate ${url}`);
      clock += s.tick ?? 0;
      if (s.navigateThrows) throw new Error('No tab with id: 5');
    },
    waitForLanding: async (_tab, _ms, o) => {
      if (o?.brightspacePage) calls.push('wait page');
      if (o?.host) calls.push(`wait host ${o.host}`);
      return landings.shift() ?? 'timeout';
    },
    launchHost: async (url) => {
      calls.push(`probe ${url}`);
      const h = hosts.length ? hosts.shift()! : 'www.aleks.com';
      return typeof h === 'object' && h !== null ? h : { host: h };
    },
    signedIn: async () => s.signedIn ?? true,
    windowState: async () => (s.states?.length ? s.states.shift()! : 'minimized'),
    framesSeen: async () => [],
    clicksSeen: async () => [],
    samplesSeen: async () => [],
    granted: async () => s.granted ?? ['https://*/*'],
    inject: async (_tab, mode, platform) => {
      calls.push(`inject ${mode}${platform ? ` ${platform}` : ''}`);
      if (s.injectThrows) throw new Error('boom');
    },
    nextMessage: async () => messages.shift() ?? 'timeout',
    closeWindow: async (id) => {
      calls.push(`close ${id}`);
      if (s.closeThrows) throw new Error('No window with id');
    },
    remember: async (id) => {
      calls.push(`remember ${id}`);
    },
  };
  return { api, calls, now: () => clock };
}
const at = (url: string): Landing => ({ url });

describe('runVisits', () => {
  it('opens nothing when there is nothing to visit', async () => {
    const f = fakeApi({});
    expect(await runVisits([], f.api)).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it('visits targets in order and returns one outcome each', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/hw1'), at('https://www.aleks.com/hw2')], messages: [found(1), { type: 'visitFound', found: null, frameUrl: 'x', top: true }] });
    const progress: number[] = [];
    const out = await runVisits([target(1), target(2)], f.api, { onProgress: (d) => progress.push(d) });
    expect(out).toEqual([
      { key: 'brightspace:topic:1', status: 'found', host: 'www.aleks.com', found: (found(1) as { found: unknown }).found },
      { key: 'brightspace:topic:2', status: 'none', host: 'www.aleks.com' },
    ]);
    expect(progress).toEqual([1, 2]);
    expect(f.calls.filter((c) => c.startsWith('navigate'))).toEqual([`navigate ${B}/launch/1`, `navigate ${B}/launch/2`]);
    expect(f.calls.slice(-2)).toEqual(['close 9', 'remember null']);
  });

  it('passes the platform to the finder', async () => {
    const f = fakeApi({ landings: [at('https://education.wiley.com/a')], messages: [found(1)] });
    await runVisits([{ ...target(1), platform: 'wileyplus' }], f.api);
    expect(f.calls).toContain('inject due wileyplus');
  });

  it('stops at the sign-in page without recording failures', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/hw1'), at(`${B}/d2l/login?target=x`)], messages: [found(1)] });
    const out = await runVisits([target(1), target(2), target(3)], f.api);
    expect(out.map((o) => o.status)).toEqual(['found', 'signed_out']);
    expect(f.calls.filter((c) => c.startsWith('navigate'))).toHaveLength(2);
    expect(f.calls.slice(-2)).toEqual(['close 9', 'remember null']);
  });

  it('asks for access instead of visiting when the launch goes to a site without access', async () => {
    const f = fakeApi({ hosts: ['learn.example.com'], granted: ['https://*.aleks.com/*'] });
    const out = await runVisits([target(1)], f.api);
    expect(out).toEqual([{ key: 'brightspace:topic:1', status: 'needs_permission', host: 'learn.example.com' }]);
    expect(f.calls.some((c) => c.startsWith('navigate'))).toBe(false);
  });

  it('a landing host without access is reported, not read', async () => {
    const f = fakeApi({ landings: [at('https://other.example.com/x')], granted: ['https://*.aleks.com/*'] });
    const out = await runVisits([target(1)], f.api);
    expect(out).toEqual([{ key: 'brightspace:topic:1', status: 'needs_permission', host: 'other.example.com' }]);
    expect(f.calls.some((c) => c.startsWith('inject'))).toBe(false);
  });

  it('session visits only land', async () => {
    const f = fakeApi({ landings: [at('https://mylab.pearson.com/home')] });
    const out = await runVisits([{ ...target(1, 'session'), key: 'pearson:session' }], f.api);
    expect(out).toEqual([{ key: 'pearson:session', status: 'landed', host: 'mylab.pearson.com' }]);
    expect(f.calls.some((c) => c.startsWith('inject'))).toBe(false);
  });

  it("a session visit waits for the platform's session host, not the first page on the platform", async () => {
    const f = fakeApi({ landings: [at('https://mylab.pearson.com/home')] });
    await runVisits([{ ...target(1, 'session'), key: 'pearson:session', platform: 'pearson' }], f.api);
    expect(f.calls).toContain('wait host mylab.pearson.com');
  });

  it('syllabus visits return the page text', async () => {
    const f = fakeApi({ landings: [at('https://purdue.simplesyllabus.com/doc/1')], messages: [{ type: 'visitText', lines: ['Oct 14 | Exam 2'], frameUrl: 'x' }] });
    const out = await runVisits([{ ...target(1, 'syllabus'), key: 'syllabus:1' }], f.api);
    expect(out).toEqual([{ key: 'syllabus:1', status: 'text', lines: ['Oct 14 | Exam 2'], host: 'purdue.simplesyllabus.com' }]);
    expect(f.calls).toContain('inject syllabus');
  });

  it('a page that never settles is a timeout', async () => {
    const f = fakeApi({ landings: ['timeout', at('https://www.aleks.com/a')], messages: ['timeout'] });
    const out = await runVisits([target(1), target(2)], f.api);
    expect(out).toEqual([
      { key: 'brightspace:topic:1', status: 'failed', reason: 'timeout' },
      { key: 'brightspace:topic:2', status: 'failed', reason: 'timeout' },
    ]);
  });

  it('the student closing the window ends the run quietly, without blaming any item', async () => {
    const f = fakeApi({ landings: ['closed'], closeThrows: true });
    const out = await runVisits([target(1), target(2)], f.api);
    expect(out).toEqual([]);
    expect(f.calls.at(-1)).toBe('remember null');
  });

  it('a window closed between visits stops the run and keeps what was read', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/a')], messages: [found(1)], states: ['minimized', 'gone'] });
    const out = await runVisits([target(1), target(2)], f.api);
    expect(out.map((o) => o.status)).toEqual(['found']);
  });

  it('a window the student un-minimized stops the run and is left open for them', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/a')], messages: [found(1)], states: ['minimized', 'open'] });
    const out = await runVisits([target(1), target(2)], f.api);
    expect(out.map((o) => o.status)).toEqual(['found']);
    expect(f.calls.some((c) => c.startsWith('close'))).toBe(false);
    expect(f.calls.at(-1)).toBe('remember null');
  });

  it('an error on one page fails that item and the run goes on', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/a'), at('https://www.aleks.com/b')], messages: [found(2)], injectThrows: false });
    let n = 0;
    const inject = f.api.inject;
    f.api.inject = async (...a) => {
      if (n++ === 0) throw new Error('Frame 0 is showing error page');
      return inject(...a);
    };
    const out = await runVisits([target(1), target(2)], f.api);
    expect(out).toEqual([
      { key: 'brightspace:topic:1', status: 'failed', reason: 'error' },
      { key: 'brightspace:topic:2', status: 'found', host: 'www.aleks.com', found: (found(2) as { found: unknown }).found },
    ]);
    expect(f.calls.slice(-2)).toEqual(['close 9', 'remember null']);
  });

  it('a reader injection that never returns (Firefox, a frame stuck loading) does not stall the run', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/a'), at('https://www.aleks.com/b')], messages: [found(1), found(2)] });
    f.api.inject = () => new Promise<void>(() => undefined);
    const out = await runVisits([target(1), target(2)], f.api, { injectMs: 5 });
    expect(out.map((o) => o.status)).toEqual(['found', 'found']);
    expect(f.calls.slice(-2)).toEqual(['close 9', 'remember null']);
  });

  it('stops when the launch page shows Brightspace signed out (session expired mid-run)', async () => {
    const f = fakeApi({ hosts: ['www.aleks.com', 'signed_out'], landings: [at('https://www.aleks.com/a')], messages: [found(1)] });
    const out = await runVisits([target(1), target(2), target(3)], f.api);
    expect(out.map((o) => o.status)).toEqual(['found', 'signed_out']);
  });

  it('a page that never loads while Brightspace is signed out stops the run', async () => {
    const f = fakeApi({ landings: ['timeout'], signedIn: false });
    const out = await runVisits([target(1), target(2)], f.api);
    expect(out).toEqual([{ key: 'brightspace:topic:1', status: 'signed_out' }]);
  });

  it('never opens a syllabus link whose site is unknown and not a known platform', async () => {
    const f = fakeApi({ hosts: [null] });
    const out = await runVisits([{ ...target(1, 'syllabus'), key: 'syllabus:1' }], f.api);
    expect(out).toEqual([{ key: 'syllabus:1', status: 'failed', reason: 'unknown' }]);
    expect(f.calls.some((c) => c.startsWith('navigate'))).toBe(false);
  });

  it('opens a launch whose site could not be read when its platform is known and allowed', async () => {
    const f = fakeApi({ hosts: [null], landings: [at('https://www.aleks.com/a')], messages: [found(1)] });
    const out = await runVisits([{ ...target(1), platform: 'aleks' }], f.api);
    expect(out.map((o) => o.status)).toEqual(['found']);
  });

  it('stops when the time budget runs out, and closes the window', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/a'), at('https://www.aleks.com/b'), at('https://www.aleks.com/c')], messages: [found(1), found(2), found(3)], tick: 200_000 });
    const out = await runVisits([target(1), target(2), target(3)], f.api, { now: f.now, budgetMs: 300_000 });
    expect(out.map((o) => o.key)).toEqual(['brightspace:topic:1', 'brightspace:topic:2']);
    expect(f.calls.slice(-2)).toEqual(['close 9', 'remember null']);
  });

  it('closes the window even when navigation throws', async () => {
    const f = fakeApi({ navigateThrows: true });
    const out = await runVisits([target(1)], f.api);
    expect(out).toEqual([{ key: 'brightspace:topic:1', status: 'failed', reason: 'error' }]);
    expect(f.calls.slice(-2)).toEqual(['close 9', 'remember null']);
  });
});

describe('runVisits: a homework link opened as a full page (like "Open in new window")', () => {
  const hw = (n: number): VisitTarget => ({ ...target(n), launchUrl: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rCode=X-${n}` });
  const wileyFound: VisitMessage = { type: 'visitFound', found: { title: 'HW11', dueAt: '2026-11-10T04:59:00.000Z', evidence: 'Due Monday, Nov 9 at 11:59 PM (EST)' }, frameUrl: 'https://education.wiley.com/was/ui/v2/assessment-player/index.html', top: true };
  const launcherNull: VisitMessage = { type: 'visitFound', found: null, frameUrl: 'https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html', top: true };

  it('opens the link itself even when it does not reveal the site; only allowed sites are read', async () => {
    const f = fakeApi({ hosts: [null], landings: [at('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html')], messages: [wileyFound] });
    const out = await runVisits([hw(1)], f.api);
    expect(f.calls).toContain(`navigate ${hw(1).launchUrl}`);
    expect(out).toEqual([{ key: 'brightspace:topic:1', status: 'found', host: 'education.wiley.com', found: (wileyFound as { found: unknown }).found }]);
  });

  it('a platform that loads in steps (hand-off, launcher, assignment) is read once the assignment appears', async () => {
    const f = fakeApi({ hosts: [null], landings: [at('https://lti.education.wiley.com/oidc/return')], messages: ['timeout', 'timeout', 'timeout', wileyFound] });
    const out = await runVisits([hw(1)], f.api);
    expect(out[0]!.status).toBe('found');
    expect(f.calls.filter((c) => c.startsWith('inject')).length).toBeGreaterThanOrEqual(4);
  });

  it('"nothing here" from the launcher does not end the wait: the assignment may still open', async () => {
    const f = fakeApi({ hosts: [null], landings: [at('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html')], messages: [launcherNull, wileyFound] });
    expect((await runVisits([hw(1)], f.api))[0]!.status).toBe('found');
  });

  it('only "nothing here" until the end is a miss', async () => {
    const f = fakeApi({ hosts: [null], landings: [at('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html')], messages: [launcherNull] });
    expect(await runVisits([hw(1)], f.api)).toEqual([{ key: 'brightspace:topic:1', status: 'none', host: 'education.wiley.com' }]);
  });

  it('the visit log says why the site could not be told', async () => {
    const f = fakeApi({ hosts: [{ host: null, note: 'no launch target on x (HTTP 200)' }], landings: [at('https://education.wiley.com/a')], messages: [wileyFound] });
    const log: { siteNote?: string }[] = [];
    await runVisits([hw(1)], f.api, { onLog: (e) => log.push(e) });
    expect(log[0]!.siteNote).toBe('no launch target on x (HTTP 200)');
  });
});

describe('closeLeftover', () => {
  it('leaves a window alone that the student opened to use (only a minimized visit window is closed)', async () => {
    const f = fakeApi({ states: ['open'] });
    await closeLeftover(42, f.api);
    expect(f.calls).toEqual(['remember null']);
  });
  it('closes a window left over from an earlier run', async () => {
    const f = fakeApi({ closeThrows: true });
    await closeLeftover(42, f.api);
    expect(f.calls).toEqual(['close 42', 'remember null']);
  });
  it('does nothing without a recorded window', async () => {
    const f = fakeApi({});
    await closeLeftover(undefined, f.api);
    expect(f.calls).toEqual([]);
  });
});

describe('launchTargetHost', () => {
  it('reads the platform host from an LTI launch form', () => {
    const html = `<form id="LtiRequestForm" action="https://www-awu.aleks.com/alekscgi/x/lti.exe" method="post"><input name="oauth_nonce"></form><script>document.forms[0].submit()</script>`;
    expect(launchTargetHost(html, B)).toBe('www-awu.aleks.com');
  });
  it('reads a scripted redirect', () => {
    expect(launchTargetHost(`<script>window.location.href = "https:\\/\\/digital.wwnorton.com\\/lti\\/login?iss=x";</script>`, B)).toBe('digital.wwnorton.com');
  });
  it('ignores Brightspace-internal targets and pages without one', () => {
    expect(launchTargetHost(`<form action="/d2l/le/lti/1/launch"></form>`, B)).toBeNull();
    expect(launchTargetHost('<p>Hello</p>', B)).toBeNull();
  });
});

describe('runVisits: visit log of pressed buttons', () => {
  it('records which "open the assignment" button was pressed', async () => {
    const f = fakeApi({ landings: [at('https://education.wiley.com/l')], messages: [found(1)] });
    f.api.clicksSeen = async () => ['Open Assignment (education.wiley.com)'];
    const log: { clicked?: string[] }[] = [];
    await runVisits([target(1)], f.api, { onLog: (e) => log.push(e) });
    expect(log[0]!.clicked).toEqual(['Open Assignment (education.wiley.com)']);
  });
});

describe('runVisits: visit log of page samples', () => {
  it('records what the pages said when nothing was found', async () => {
    const f = fakeApi({ landings: [at('https://education.wiley.com/l')], messages: [{ type: 'visitFound', found: null, frameUrl: 'https://education.wiley.com/l', top: true }] });
    f.api.samplesSeen = async () => [{ url: 'https://education.wiley.com/l', text: 'Launching', buttons: ['Open'] }];
    const log: { pages?: unknown[] }[] = [];
    await runVisits([target(1)], f.api, { onLog: (e) => log.push(e) });
    expect(log[0]!.pages).toEqual([{ url: 'https://education.wiley.com/l', text: 'Launching', buttons: ['Open'] }]);
  });
});

describe('runVisits: visit log', () => {
  it('records what each visit saw, step by step', async () => {
    const f = fakeApi({ hosts: ['education.wiley.com'], landings: [at('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=SECRET')], messages: [{ type: 'visitFound', found: null, frameUrl: 'https://education.wiley.com/x', top: true }] });
    f.api.framesSeen = async () => ['https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html'];
    const log: unknown[] = [];
    await runVisits([{ ...target(1), launchUrl: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rCode=X-1` }], f.api, { onLog: (e) => log.push(e), now: () => 1_700_000_000_000 });
    expect(log).toEqual([
      {
        at: new Date(1_700_000_000_000).toISOString(),
        key: 'brightspace:topic:1',
        title: 'HW 1',
        site: 'education.wiley.com',
        opened: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l`,
        landed: 'https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html',
        frames: ['https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html'],
        result: 'none',
        mode: 'window',
      },
    ]);
  });
});

describe('runVisits: visit log of found dates', () => {
  it('records the date read and the text it came from', async () => {
    const f = fakeApi({ landings: [at('https://www.aleks.com/a')], messages: [found(1)] });
    const log: { due?: string; evidence?: string }[] = [];
    await runVisits([target(1)], f.api, { onLog: (e) => log.push(e) });
    expect(log[0]).toMatchObject({ due: '2026-11-11T04:59:00.000Z', evidence: 'Due Nov 11' });
  });
});
