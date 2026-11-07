import { describe, it, expect } from 'vitest';
import { accessToAsk, grantedPlatforms, missingRequired, REQUIRED_ORIGINS, snoozeUntil } from '../../src/core/permissions';
import { migrate } from '../../src/storage/store';
import type { StoreShape } from '../../src/core/types';

const now = new Date('2026-11-07T12:00:00-05:00');
const LTI = (r: string) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=${r}`;
const linking = (links: [string, string][], extra: Record<string, unknown> = {}): StoreShape =>
  migrate({
    snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], courses: [], links: links.map(([title, url]) => ({ source: 'brightspace', sourceCourseId: '1', title, url })) } },
    ...extra,
  });

describe('accessToAsk', () => {
  it('asks for a platform a course launches when its sites are not granted', () => {
    const asks = accessToAsk(linking([['ALEKS', LTI('A')]]), [], now);
    expect(asks).toEqual([{ key: 'aleks', label: 'ALEKS', origins: ['https://*.aleks.com/*'] }]);
  });

  it('does not ask once access is granted', () => {
    expect(accessToAsk(linking([['ALEKS', LTI('A')]]), ['https://*.aleks.com/*'], now)).toEqual([]);
    expect(accessToAsk(linking([['ALEKS', LTI('A')]]), ['https://*/*'], now)).toEqual([]);
  });

  it('never asks for platforms read in the background or without deadlines', () => {
    expect(accessToAsk(linking([['Gradescope', LTI('G')], ['Piazza', 'https://piazza.com/class/x'], ['Pearson MyLab', LTI('P')]]), [], now)).toEqual([]);
  });

  it('asks for hosts a visit could not read, by name', () => {
    const s = linking([], { visitState: { needsPermission: ['learn.example.com'], snoozed: {} } });
    expect(accessToAsk(s, [], now)).toEqual([{ key: 'learn.example.com', label: 'learn.example.com', origins: ['https://learn.example.com/*'] }]);
  });

  it('a host that belongs to a known platform asks for that platform', () => {
    const s = linking([], { visitState: { needsPermission: ['www-awu.aleks.com'], snoozed: {} } });
    expect(accessToAsk(s, [], now)).toEqual([{ key: 'aleks', label: 'ALEKS', origins: ['https://*.aleks.com/*'] }]);
  });

  it('respects "Not now" until it runs out', () => {
    const s = linking([['ALEKS', LTI('A')]], { visitState: { needsPermission: [], snoozed: { aleks: snoozeUntil(new Date(now.getTime() - 86_400_000)) } } });
    expect(accessToAsk(s, [], now)).toEqual([]);
    expect(accessToAsk(s, [], new Date(now.getTime() + 7 * 86_400_000))).toHaveLength(1);
  });
});

describe('missingRequired', () => {
  it('lists required sites the browser has not granted', () => {
    expect(missingRequired(['https://purdue.brightspace.com/*'])).toEqual(['https://www.gradescope.com/*', 'https://mylab.pearson.com/*']);
    expect(missingRequired(REQUIRED_ORIGINS)).toEqual([]);
  });
});

describe('grantedPlatforms', () => {
  it('names the optional platform access the student gave', () => {
    expect(grantedPlatforms([...REQUIRED_ORIGINS, 'https://*.aleks.com/*', 'https://learn.example.com/*'])).toEqual([
      { key: 'aleks', label: 'ALEKS', origins: ['https://*.aleks.com/*'] },
      { key: 'learn.example.com', label: 'learn.example.com', origins: ['https://learn.example.com/*'] },
    ]);
  });
});
