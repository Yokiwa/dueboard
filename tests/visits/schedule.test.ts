import { describe, it, expect } from 'vitest';
import { dueVisits, scoreVisits, MAX_VISITS, originAllowed } from '../../src/visits/schedule';
import { migrate } from '../../src/storage/store';
import type { CapturedDue, RawItem, StoreShape } from '../../src/core/types';

const now = new Date('2026-11-07T12:00:00-05:00');
const H = 3_600_000;
const ago = (h: number) => new Date(now.getTime() - h * H).toISOString();
const B = 'https://purdue.brightspace.com';
const launch = (n: number) => `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rCode=X-${n}`;

const topic = (n: number, title = `HW ${n}`, p: Partial<RawItem> = {}): RawItem => ({
  source: 'brightspace', sourceItemId: `topic:${n}`, sourceCourseId: '1', title, type: 'assignment', dueAt: null,
  url: `${B}/d2l/le/content/1/viewContent/${n}/View`, submitted: false, launchUrl: launch(n), ...p,
});
const store = (items: RawItem[], captured: Record<string, CapturedDue> = {}, extra: Record<string, unknown> = {}): StoreShape =>
  migrate({
    snapshots: {
      brightspace: {
        syncedAt: now.toISOString(),
        courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA 16100', code: 'MA 16100', url: `${B}/d2l/home/1` }],
        items, links: [], partial: [],
      },
    },
    captured,
    settings: { visits: 'auto', syllabus: true }, // these rules are about automatic reading
    ...extra,
  });
const cap = (n: number, p: Partial<CapturedDue>): Record<string, CapturedDue> => ({
  [`brightspace:topic:${n}`]: { itemKey: `brightspace:topic:${n}`, title: `HW ${n}`, dueAt: null, platform: 'aleks', via: 'visit', checkedAt: ago(1), ...p },
});
const keys = (s: StoreShape, trigger: 'auto' | 'manual' = 'auto', granted: string[] = ['https://*/*']) => dueVisits(s, now, trigger, granted).map((t) => t.key);

describe('dueVisits', () => {
  it('visits an undated launch that was never visited', () => {
    expect(dueVisits(store([topic(1)]), now, 'auto', [])).toEqual([
      // Opened as a full page, like "Open in new window": platforms refuse to show inside Brightspace's frame.
      { key: 'brightspace:topic:1', title: 'HW 1', courseId: 'brightspace:1', launchUrl: launch(1), mode: 'due' },
    ]);
  });

  it('skips items Brightspace already dates, and items without a launch', () => {
    expect(keys(store([topic(1, 'HW 1', { dueAt: '2026-11-10T04:59:00.000Z' }), topic(2, 'HW 2', { launchUrl: undefined })]))).toEqual([]);
  });

  it('skips submitted and done items', () => {
    const s = store([topic(1, 'HW 1', { submitted: true }), topic(2)]);
    s.userState.done['brightspace:topic:2'] = true;
    expect(keys(s)).toEqual([]);
  });

  it('a found date more than 3 days away is rechecked every 3 days; a nearer one daily', () => {
    const far = '2026-11-20T04:59:00.000Z';
    expect(keys(store([topic(1)], cap(1, { dueAt: far, checkedAt: ago(25) })))).toEqual([]);
    expect(keys(store([topic(1)], cap(1, { dueAt: far, checkedAt: ago(71) })))).toEqual([]);
    expect(keys(store([topic(1)], cap(1, { dueAt: far, checkedAt: ago(73) })))).toEqual(['brightspace:topic:1']);
    // Read when it was far off; now it's 2 days away: daily again.
    expect(keys(store([topic(1)], cap(1, { dueAt: '2026-11-09T17:00:00.000Z', checkedAt: ago(25) })))).toEqual(['brightspace:topic:1']);
  });

  it('rechecks a found date after 24 hours, not before', () => {
    expect(keys(store([topic(1)], cap(1, { dueAt: '2026-11-10T04:59:00.000Z', checkedAt: ago(23) })))).toEqual([]);
    expect(keys(store([topic(1)], cap(1, { dueAt: '2026-11-10T04:59:00.000Z', checkedAt: ago(25) })))).toEqual(['brightspace:topic:1']);
  });

  it('never visits again once the found date has passed', () => {
    expect(keys(store([topic(1)], cap(1, { dueAt: ago(2), checkedAt: ago(48) })))).toEqual([]);
  });

  it('retries "no date found" after 24 hours, up to 3 times', () => {
    expect(keys(store([topic(1)], cap(1, { misses: 2, checkedAt: ago(23) })))).toEqual([]);
    expect(keys(store([topic(1)], cap(1, { misses: 2, checkedAt: ago(25) })))).toEqual(['brightspace:topic:1']);
    expect(keys(store([topic(1)], cap(1, { misses: 3, checkedAt: ago(25) })))).toEqual([]);
  });

  it('after 3 misses, only a manual refresh visits, at most hourly', () => {
    expect(keys(store([topic(1)], cap(1, { misses: 3, checkedAt: ago(2) })), 'manual')).toEqual(['brightspace:topic:1']);
    expect(keys(store([topic(1)], cap(1, { misses: 3, checkedAt: ago(0.5) })), 'manual')).toEqual([]);
  });

  it('retries a failed visit after 6 hours', () => {
    expect(keys(store([topic(1)], cap(1, { failures: 1, checkedAt: ago(5) })))).toEqual([]);
    expect(keys(store([topic(1)], cap(1, { failures: 1, checkedAt: ago(7) })))).toEqual(['brightspace:topic:1']);
  });

  it('waits on a blocked host until access is granted', () => {
    const s = store([topic(1)], cap(1, { blocked: 'learn.example.com', checkedAt: ago(0.1) }));
    expect(keys(s, 'auto', [])).toEqual([]);
    expect(keys(s, 'auto', ['https://learn.example.com/*'])).toEqual(['brightspace:topic:1']);
  });

  it('skips launches of platforms read another way, and known platforms without access', () => {
    const s = store([topic(1, 'Gradescope HW 1'), topic(2, 'ALEKS Homework 2'), topic(3, 'Homework 3')]);
    expect(keys(s, 'auto', [])).toEqual(['brightspace:topic:3']);
    expect(keys(s, 'auto', ['https://*.aleks.com/*'])).toEqual(['brightspace:topic:2', 'brightspace:topic:3']);
  });

  it('respects the visit setting', () => {
    expect(keys(store([topic(1)], {}, { settings: { visits: 'off', syllabus: true } }), 'manual')).toEqual([]);
    expect(keys(store([topic(1)], {}, { settings: { visits: 'manual', syllabus: true } }), 'auto')).toEqual([]);
    expect(keys(store([topic(1)], {}, { settings: { visits: 'manual', syllabus: true } }), 'manual')).toEqual(['brightspace:topic:1']);
  });

  it('puts never-visited first, then oldest, and caps at 25', () => {
    const items = Array.from({ length: 30 }, (_, i) => topic(i + 1));
    const captured = Object.assign({}, ...items.slice(0, 28).map((_, i) => cap(i + 1, { misses: 1, checkedAt: ago(30 + i) })));
    const got = keys(store(items, captured));
    expect(got).toHaveLength(25);
    expect(got.slice(0, 3)).toEqual(['brightspace:topic:29', 'brightspace:topic:30', 'brightspace:topic:28']);
  });

  it('adds a Pearson session visit when Pearson is signed out and a course launches it', () => {
    const base = store([]);
    base.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P' }];
    base.syncMeta.pearson = { lastSuccess: ago(10), lastError: { at: ago(1), reason: 'not_logged_in' } };
    expect(dueVisits(base, now, 'auto', [])[0]).toMatchObject({ key: 'pearson:session', mode: 'session', launchUrl: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P` });
    base.syncMeta.pearson = { lastSuccess: ago(0.5), lastError: { at: ago(1), reason: 'not_logged_in' } };
    expect(keys(base)).toEqual([]);
  });
});

describe('originAllowed', () => {
  it('matches granted origin patterns against a host', () => {
    expect(originAllowed(['https://*/*'], 'anything.com')).toBe(true);
    expect(originAllowed(['https://*.aleks.com/*'], 'www-awu.aleks.com')).toBe(true);
    expect(originAllowed(['https://*.aleks.com/*'], 'evil.com')).toBe(false);
    expect(originAllowed(['https://learn.example.com/*'], 'learn.example.com')).toBe(true);
    expect(originAllowed(['<all_urls>'], 'x.com')).toBe(true);
    expect(originAllowed([], 'x.com')).toBe(false);
  });
});

describe('dueVisits: syllabus launches', () => {
  it('adds a syllabus visit for a course with a Simple Syllabus launch', () => {
    const s = store([]);
    s.snapshots.brightspace!.syllabusSources = [{ ou: '1', kind: 'visit', url: 'https://purdue.simplesyllabus.com/doc/1', title: 'Syllabus', modified: null }];
    expect(dueVisits(s, now, 'auto', ['https://*/*'])).toEqual([
      { key: 'syllabus:1', title: 'Syllabus', courseId: 'brightspace:1', launchUrl: 'https://purdue.simplesyllabus.com/doc/1', platform: 'simplesyllabus', mode: 'syllabus' },
    ]);
  });
  it('leaves syllabus files to the background reader', () => {
    const s = store([]);
    s.snapshots.brightspace!.syllabusSources = [{ ou: '1', kind: 'pdf', url: `${B}/s.pdf`, title: 'Syllabus', modified: null }];
    expect(dueVisits(s, now, 'auto', ['https://*/*'])).toEqual([]);
  });
});

describe('dueVisits: fixes from review', () => {
  const pearsonStore = (session?: { at: string; failures: number }) => {
    const s = store([]);
    s.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Pearson MyLab', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=P' }];
    s.syncMeta.pearson = { lastError: { at: ago(0.1), reason: 'not_logged_in' } };
    if (session) s.visitState.sessions = { pearson: session };
    return s;
  };

  it('retries the Pearson session at most every 6 hours', () => {
    expect(keys(pearsonStore({ at: ago(5), failures: 1 }))).toEqual([]);
    expect(keys(pearsonStore({ at: ago(7), failures: 1 }))).toEqual(['pearson:session']);
  });

  it('after 3 failed Pearson session attempts, only a manual refresh tries again', () => {
    expect(keys(pearsonStore({ at: ago(7), failures: 3 }))).toEqual([]);
    expect(keys(pearsonStore({ at: ago(7), failures: 3 }), 'manual')).toEqual(['pearson:session']);
  });

  it('caps failed visits like misses: after 3, only a manual refresh, at most hourly', () => {
    expect(keys(store([topic(1)], cap(1, { failures: 3, checkedAt: ago(7) })))).toEqual([]);
    expect(keys(store([topic(1)], cap(1, { failures: 3, checkedAt: ago(2) })), 'manual')).toEqual(['brightspace:topic:1']);
  });

  it('never opens quizzes or exams on its own', () => {
    const s = store([topic(1, 'Quiz 3'), topic(2, 'Midterm Exam 1'), topic(3, 'Unit Test 2'), topic(4, 'Homework 4')]);
    expect(keys(s)).toEqual(['brightspace:topic:4']);
  });
});

describe('dueVisits: dates in titles', () => {
  it('never opens a homework whose title already says when it is due', () => {
    expect(keys(store([topic(1, 'HW11 (10.3, 12.1)_due_Nov 11'), topic(2, 'Homework 2')]))).toEqual(['brightspace:topic:2']);
  });
});

describe('dueVisits: signing back in to Gradescope through any course', () => {
  const withGradescope = (meta: object, sessions?: object) => {
    const s = store([]);
    s.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'Gradescope', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=G' }];
    s.syncMeta.gradescope = meta as never;
    if (sessions) s.visitState.sessions = sessions as never;
    return s;
  };

  it('opens a course\'s Gradescope entry once when Gradescope is signed out', () => {
    expect(dueVisits(withGradescope({ lastError: { at: ago(0.1), reason: 'not_logged_in' } }), now, 'auto', [])).toEqual([
      { key: 'gradescope:session', title: 'Gradescope', courseId: '', launchUrl: `${B}/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=G`, platform: 'gradescope', mode: 'session' },
    ]);
  });

  it('not while Gradescope reads fine, and not more often than every 6 hours', () => {
    expect(keys(withGradescope({ lastSuccess: ago(0.1) }))).toEqual([]);
    expect(keys(withGradescope({ lastError: { at: ago(0.1), reason: 'not_logged_in' } }, { gradescope: { at: ago(5), failures: 1 } }))).toEqual([]);
    expect(keys(withGradescope({ lastError: { at: ago(0.1), reason: 'not_logged_in' } }, { gradescope: { at: ago(7), failures: 1 } }))).toEqual(['gradescope:session']);
  });

  it('a course without a Gradescope entry adds nothing', () => {
    const s = store([]);
    s.syncMeta.gradescope = { lastError: { at: ago(0.1), reason: 'not_logged_in' } };
    expect(keys(s)).toEqual([]);
  });
});

describe('score-only entries', () => {
  it('an unfinished item with only a score-only entry is a due-visit candidate at once', () => {
    const c = cap(1, { checkedAt: ago(1), score: { text: '1/2', from: 'ALEKS' }, scoreCheckedAt: ago(1) });
    expect(keys(store([topic(1)], c))).toEqual(['brightspace:topic:1']);
  });
});

describe('scoreVisits', () => {
  const dueAgo = (d: number) => new Date(now.getTime() - d * 24 * H).toISOString();
  const wiley = (n: number, p: Partial<RawItem> = {}) => topic(n, `WileyPLUS HW ${n}`, { submitted: true, dueAt: dueAgo(2), ...p });
  const sk = (s: StoreShape, trigger: 'auto' | 'manual' = 'auto', granted: string[] = ['https://*/*']) => scoreVisits(s, now, trigger, granted).map((t) => t.key);
  const K = 'brightspace:topic:1';

  it('targets a submitted platform homework with a launch', () => {
    const t = scoreVisits(store([wiley(1)]), now, 'auto', ['https://*/*']);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ key: K, mode: 'score', launchUrl: launch(1), title: 'WileyPLUS HW 1' });
    expect(t[0]!.platform).toBeTruthy();
  });

  it('targets a done item and an unknown platform', () => {
    const s = store([topic(1, 'HW 1', { dueAt: dueAgo(1) })]);
    s.userState.done[K] = true;
    expect(sk(s)).toEqual([K]);
  });

  it('skips unfinished, undated and old items, and quizzes', () => {
    expect(sk(store([wiley(1, { submitted: false })]))).toEqual([]);
    expect(sk(store([wiley(1, { dueAt: null })]))).toEqual([]);
    expect(sk(store([wiley(1, { dueAt: dueAgo(8) })]))).toEqual([]);
    expect(sk(store([topic(1, 'Quiz 1 WileyPLUS', { submitted: true, dueAt: dueAgo(2) })]))).toEqual([]);
  });

  it('skips fetched scores, but re-reads a score from an earlier visit', () => {
    for (const from of ['Brightspace', 'Gradescope', 'Pearson']) {
      expect(sk(store([wiley(1, { score: { text: '1/2', from } })]))).toEqual([]);
    }
    const c = cap(1, { score: { text: '1/2', from: 'WileyPLUS' }, scoreCheckedAt: ago(1) });
    expect(sk(store([wiley(1)], c))).toEqual([K]);
  });

  it('skips fetch/none-reader platforms', () => {
    expect(sk(store([topic(1, 'Gradescope HW 1', { submitted: true, dueAt: dueAgo(2) })]))).toEqual([]);
    expect(sk(store([topic(1, 'Pearson MyLab HW 1', { submitted: true, dueAt: dueAgo(2) })]))).toEqual([]);
  });

  it('a known platform needs its hosts granted', () => {
    expect(sk(store([wiley(1)]), 'auto', [])).toEqual([]);
  });

  it('follows the visits setting', () => {
    expect(sk(store([wiley(1)], {}, { settings: { visits: 'manual', syllabus: true } }), 'auto')).toEqual([]);
    expect(sk(store([wiley(1)], {}, { settings: { visits: 'manual', syllabus: true } }), 'manual')).toEqual([K]);
    expect(sk(store([wiley(1)], {}, { settings: { visits: 'off', syllabus: true } }), 'manual')).toEqual([]);
  });

  it('dueVisits lists due targets before score targets and caps the total', () => {
    const items = [wiley(1), topic(2), ...Array.from({ length: 30 }, (_, i) => wiley(10 + i))];
    const t = dueVisits(store(items), now, 'manual', ['https://*/*']);
    expect(t.map((x) => x.mode).slice(0, 2)).toEqual(['due', 'score']);
    expect(t.filter((x) => x.mode === 'due')[0]!.key).toBe('brightspace:topic:2');
    expect(t.length).toBeLessThanOrEqual(MAX_VISITS);
    expect(t.length).toBe(MAX_VISITS);
  });
});
