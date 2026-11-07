import { describe, it, expect, vi } from 'vitest';
import { syncWithDiscovery } from '../../src/background/syncFlow';
import { migrate } from '../../src/storage/store';
import type { Connector, SourceId, StoreShape } from '../../src/core/types';

const pearsonLink = { source: 'brightspace' as const, sourceCourseId: '1', title: 'Access Pearson', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=Z' };
const fake = (id: SourceId): Connector => ({ id, fetchAll: async () => ({ ok: true, courses: [], items: [], links: [], partial: [] }) });

describe('syncWithDiscovery', () => {
  it('syncs a platform in the same run as the Brightspace sync that discovered it', async () => {
    let store: StoreShape = migrate({});
    const runs: SourceId[][] = [];
    const run = vi.fn(async (cs: Connector[]) => {
      runs.push(cs.map((c) => c.id));
      if (cs.some((c) => c.id === 'brightspace')) {
        store = migrate({ snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], courses: [], links: [pearsonLink] } } });
      }
      return Object.fromEntries(cs.map((c) => [c.id, 'ok']));
    });
    const report = await syncWithDiscovery(async () => store, (ids) => ids.map(fake), run);
    expect(runs).toEqual([['brightspace', 'gradescope'], ['pearson']]);
    expect(report).toEqual({ brightspace: 'ok', gradescope: 'ok', pearson: 'ok' });
  });

  it('runs once when nothing new is discovered', async () => {
    const run = vi.fn(async (cs: Connector[]) => Object.fromEntries(cs.map((c) => [c.id, 'ok'])));
    await syncWithDiscovery(async () => migrate({}), (ids) => ids.map(fake), run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
