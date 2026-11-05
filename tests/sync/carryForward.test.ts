import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { runSync } from '../../src/sync/runSync';
import { loadStore, saveSnapshot } from '../../src/storage/store';
import type { Connector, RawItem } from '../../src/core/types';

const it0 = (id: string, course: string): RawItem => ({ source: 'brightspace', sourceItemId: id, sourceCourseId: course, title: id, type: 'assignment', dueAt: null, url: '', submitted: false });

describe('runSync carries partial courses forward (I1)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('keeps the previous items and links of courses that failed this time', async () => {
    await saveSnapshot('brightspace', {
      syncedAt: 'old', courses: [], partial: [],
      items: [it0('old-a', '1'), it0('old-b', '2')],
      links: [{ source: 'brightspace', sourceCourseId: '2', title: 'Ed', url: 'https://edstem.org/x' }],
    });
    const c: Connector = {
      id: 'brightspace',
      fetchAll: async () => ({ ok: true, courses: [], items: [it0('new-a', '1')], links: [], partial: ['2'] }),
    };
    await runSync([c], () => new Date('2026-11-04T17:00:00Z'));
    const snap = (await loadStore()).snapshots.brightspace!;
    expect(snap.items.map((i) => i.sourceItemId).sort()).toEqual(['new-a', 'old-b']);
    expect(snap.links.map((l) => l.title)).toEqual(['Ed']);
    expect(snap.partial).toEqual(['2']);
  });
});
