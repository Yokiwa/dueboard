import { describe, it, expect } from 'vitest';
import { activeSourceIds } from '../../src/background/sources';
import { migrate } from '../../src/storage/store';

describe('activeSourceIds', () => {
  it('a new user: Brightspace, plus a quiet Gradescope check (many courses use it without linking it)', () => {
    expect(activeSourceIds(migrate({}))).toEqual(['brightspace', 'gradescope']);
  });
  it('adds Pearson only once a course links to Pearson', () => {
    const s = migrate({ snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], courses: [], links: [{ source: 'brightspace', sourceCourseId: '1', title: 'Access Pearson', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=Z' }] } } });
    expect(activeSourceIds(s)).toEqual(['brightspace', 'gradescope', 'pearson']);
  });
  it('keeps Pearson once it has data', () => {
    const s = migrate({ snapshots: { pearson: { syncedAt: 'x', partial: [], items: [], links: [], courses: [{ source: 'pearson', sourceCourseId: '1', name: 'Pearson MyLab', code: null, url: 'u' }] } } });
    expect(activeSourceIds(s)).toContain('pearson');
  });
});
