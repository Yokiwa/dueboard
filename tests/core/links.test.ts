import { describe, it, expect } from 'vitest';
import { classifyLink } from '../../src/core/links';

describe('classifyLink by domain', () => {
  it.each([
    ['https://www.gradescope.com/courses/1', 'Gradescope', 'homework'],
    ['https://www.webassign.net/web/Student/Home.html', 'WebAssign', 'homework'],
    ['https://mlm.pearson.com/northamerica/masteringphysics/', 'Pearson', 'homework'],
    ['https://www.pearsonmylabandmastering.com/', 'Pearson', 'homework'],
    ['https://connect.mheducation.com/class/x', 'McGraw-Hill Connect', 'homework'],
    ['https://www.cengage.com/dashboard', 'Cengage', 'textbook'],
    ['https://learn.zybooks.com/zybook/PURDUECS180', 'zyBooks', 'textbook'],
    ['https://piazza.com/class/abc', 'Piazza', 'discussion'],
    ['https://edstem.org/us/courses/1', 'Ed', 'discussion'],
    ['https://www.wileyplus.com/course/123', 'WileyPLUS', 'homework'],
    ['https://education.wiley.com/courses/abc', 'WileyPLUS', 'homework'],
  ])('%s', (url, label, category) => {
    expect(classifyLink('anything', url)).toEqual({ label, category });
  });
});

describe('classifyLink other cases', () => {
  it('LTI launch inside Brightspace is classified by title keyword', () => {
    expect(classifyLink('Pearson MyLab & Mastering', 'https://purdue.brightspace.com/d2l/le/lti/123/toolLaunch/4')).toEqual({ label: 'Pearson', category: 'homework' });
    expect(classifyLink('McGraw Hill Connect', '/d2l/le/lti/1/toolLaunch/2')).toEqual({ label: 'McGraw-Hill Connect', category: 'homework' });
  });
  it('plain Brightspace content page is not shown', () => {
    expect(classifyLink('Week 1 notes', 'https://purdue.brightspace.com/d2l/le/content/1/viewContent/2')).toBeNull();
    expect(classifyLink('Week 1 notes', '/content/enforced/1/notes.pdf')).toBeNull();
  });
  it('unknown LTI tool is not shown', () => {
    expect(classifyLink('Kaltura', 'https://purdue.brightspace.com/d2l/le/lti/1/toolLaunch/2')).toBeNull();
  });
  it('other external site becomes a website link named by its title', () => {
    expect(classifyLink('Course website', 'https://cs.purdue.edu/~x/cs180')).toEqual({ label: 'Course website', category: 'website' });
  });
  it('non-http links are ignored', () => {
    expect(classifyLink('Email TA', 'mailto:ta@purdue.edu')).toBeNull();
    expect(classifyLink('bad', '::::')).toBeNull();
  });

  it('Brightspace quickLink launches and content-topic pages count when the title names a platform', () => {
    expect(classifyLink('WileyPLUS', '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=X')).toEqual({ label: 'WileyPLUS', category: 'homework' });
    expect(classifyLink('Pearson MyLab Math', 'https://purdue.brightspace.com/d2l/le/content/1/viewContent/2/View')).toEqual({ label: 'Pearson', category: 'homework' });
    expect(classifyLink('Week 1 notes', '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti')).toBeNull();
  });
});
