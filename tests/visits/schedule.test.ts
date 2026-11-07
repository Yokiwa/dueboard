import { describe, it, expect } from 'vitest';
import { dueVisits, originAllowed } from '../../src/visits/schedule';
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
    ...extra,
  });
const cap = (n: number, p: Partial<CapturedDue>): Record<string, CapturedDue> => ({
  [`brightspace:topic:${n}`]: { itemKey: `brightspace:topic:${n}`, title: `HW ${n}`, dueAt: null, platform: 'aleks', via: 'visit', checkedAt: ago(1), ...p },
});
const keys = (s: StoreShape, trigger: 'auto' | 'manual' = 'auto', granted: string[] = ['https://*/*']) => dueVisits(s, now, trigger, granted).map((t) => t.key);

describe('dueVisits', () => {
  it('visits an undated launch that was never visited', () => {
    expect(dueVisits(store([topic(1)]), now, 'auto', [])).toEqual([
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
