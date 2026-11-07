import { describe, it, expect } from 'vitest';
import { platformsInBrightspace, relevantSources } from '../../src/core/platforms';
import { migrate } from '../../src/storage/store';

const link = (title: string, url: string) => ({ source: 'brightspace' as const, sourceCourseId: '1', title, url });
const bs = (links: ReturnType<typeof link>[]) => ({ syncedAt: 'x', partial: [], items: [], courses: [], links });
const lti = (n: string) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=X-${n}`;

describe('platformsInBrightspace (discovered from course content only)', () => {
  it('finds nothing in a Brightspace-only student', () => {
    expect(platformsInBrightspace(migrate({ snapshots: { brightspace: bs([link('Syllabus', '/content/enforced/1/syllabus.pdf')]) } }))).toEqual([]);
  });
  it('finds Gradescope and Pearson from their links', () => {
    const s = migrate({ snapshots: { brightspace: bs([link('Gradescope', 'https://www.gradescope.com/courses/9'), link('Access Pearson', lti('126'))]) } });
    expect(platformsInBrightspace(s)).toEqual(['gradescope', 'pearson']);
  });
});

describe('relevantSources', () => {
  it('Brightspace always; others only when linked from Brightspace or already holding data', () => {
    expect(relevantSources(migrate({}))).toEqual(['brightspace']);
    const gsData = migrate({ snapshots: { gradescope: { syncedAt: 'x', partial: [], items: [], links: [], courses: [{ source: 'gradescope', sourceCourseId: '9', name: 'CS 180', code: 'CS 18000', url: 'u' }] } } });
    expect(relevantSources(gsData)).toEqual(['brightspace', 'gradescope']);
    const emptyGs = migrate({ snapshots: { gradescope: { syncedAt: 'x', partial: [], items: [], links: [], courses: [] } } });
    expect(relevantSources(emptyGs)).toEqual(['brightspace']);
    const linked = migrate({ snapshots: { brightspace: bs([link('Access Pearson', lti('126'))]) } });
    expect(relevantSources(linked)).toEqual(['brightspace', 'pearson']);
  });
});

import { launchLinks } from '../../src/core/platforms';

describe('launchLinks (how to reach each platform through Brightspace)', () => {
  it('first Brightspace launch per platform, as an absolute URL; direct platform URLs are not launches', () => {
    const s = migrate({ snapshots: { brightspace: bs([
      link('Gradescope (course page)', 'https://www.gradescope.com/courses/9'),
      link('Gradescope', lti('77')),
      link('Access Pearson', lti('126')),
      link('Access Pearson again', lti('127')),
    ]) } });
    expect(launchLinks(s)).toEqual({
      gradescope: `https://purdue.brightspace.com${lti('77')}`,
      pearson: `https://purdue.brightspace.com${lti('126')}`,
    });
  });
  it('none when Brightspace has no launch for a platform', () => {
    expect(launchLinks(migrate({ snapshots: { brightspace: bs([link('Gradescope', 'https://www.gradescope.com/courses/9')]) } }))).toEqual({});
  });
});
