import { describe, it, expect } from 'vitest';
import { scrubPage, linksBundle } from '../../src/diagnostics/pageExport';
import { migrate } from '../../src/storage/store';

describe('scrubPage', () => {
  const html = `<html><head><meta name="csrf-token" content="TOKEN1"></head><body>
<span class="user">Raymond Weng</span> <a href="mailto:rw@purdue.edu">rw@purdue.edu</a>
<form><input type="hidden" name="__VIEWSTATE" value="BIGSTATE"><input type="hidden" id="__EVENTVALIDATION" value="EV"><input type="text" name="q" value="typed"></form>
<script>var session = {"token":"abc123secret","email":"x@y.com"};</script>
<table><tr><td>HW 13.1</td><td>11/12/26 11:59pm</td></tr></table></body></html>`;

  it('removes emails, hidden and typed input values, csrf meta, and token-like JSON values; keeps assignments', () => {
    const out = scrubPage(html, 'https://mylab.pearson.com/Student/DoAssignments.aspx?view=all', ['Raymond Weng'], new Date('2026-11-06T12:00:00Z'));
    for (const secret of ['rw@purdue.edu', 'x@y.com', 'BIGSTATE', '"EV"', 'typed', 'TOKEN1', 'abc123secret', 'Raymond Weng']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('HW 13.1');
    expect(out).toContain('11/12/26 11:59pm');
    expect(out.startsWith('<!-- DueBoard page export\nurl: https://mylab.pearson.com/Student/DoAssignments.aspx?view=all\n')).toBe(true);
  });

  it('drops the query string values that look like session ids from the recorded url', () => {
    const out = scrubPage('<p>x</p>', 'https://x.com/a?sessionId=ABC&view=all', [], new Date(0));
    expect(out).toContain('url: https://x.com/a?sessionId=[REDACTED]&view=all');
  });
});

describe('linksBundle', () => {
  it('lists each Brightspace course with its raw content links, nothing else', () => {
    const store = migrate({
      snapshots: {
        brightspace: {
          syncedAt: 'x', partial: ['2'], items: [{ title: 'secret item' }],
          courses: [{ source: 'brightspace', sourceCourseId: '1638698', name: 'Fall 2026 MA 261 331 332 333 REC', code: 'MA 26100', url: 'u' }],
          links: [{ source: 'brightspace', sourceCourseId: '1638698', title: 'Access Pearson', url: '/d2l/le/lti/123' }],
        },
      },
      userState: { done: { a: true } },
    });
    const b = linksBundle(store, new Date('2026-11-06T12:00:00Z'));
    expect(b).toEqual({
      exportedAt: '2026-11-06T12:00:00.000Z',
      partial: ['2'],
      courses: [{ id: '1638698', name: 'Fall 2026 MA 261 331 332 333 REC', code: 'MA 26100', links: [{ title: 'Access Pearson', url: '/d2l/le/lti/123' }] }],
    });
  });
});
