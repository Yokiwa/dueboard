import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { VisitLog } from '../../src/entrypoints/diagnostics/VisitLog';
import { appendVisitLog } from '../../src/storage/store';

describe('Diagnostics: visit log', () => {
  beforeEach(() => fakeBrowser.reset());

  it('lists each visit with where it went, the frames that loaded and the result, newest first', async () => {
    await appendVisitLog([
      { at: '2026-11-08T10:00:00.000Z', key: 'brightspace:topic:5', title: 'PHYS 172H - HW11 - FA26', site: 'education.wiley.com', opened: 'https://purdue.brightspace.com/d2l/le/content/1/viewContent/5/View', landed: 'https://purdue.brightspace.com/d2l/le/content/1/viewContent/5/View', frames: ['https://purdue.brightspace.com/d2l/le/content/1/viewContent/5/View'], result: 'none' },
      { at: '2026-11-08T10:01:00.000Z', key: 'brightspace:topic:9', title: 'Achieve HW 3', site: 'achieve.macmillanlearning.com', opened: 'o', landed: 'timeout', frames: [], result: 'failed', detail: 'timeout' },
    ]);
    render(<VisitLog />);
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2
    expect(rows[1]!.textContent).toContain('Achieve HW 3');
    expect(rows[1]!.textContent).toContain('failed (timeout)');
    expect(rows[2]!.textContent).toContain('PHYS 172H - HW11 - FA26');
    expect(rows[2]!.textContent).toContain('education.wiley.com');
    expect(rows[2]!.textContent).toContain('1 frame');
    expect(screen.getByRole('button', { name: 'Download visit log' })).toBeTruthy();
  });

  it('shows the score a visit read', async () => {
    await appendVisitLog([
      { at: '2026-11-08T10:00:00.000Z', key: 'brightspace:topic:5', title: 'HW11', site: 'education.wiley.com', opened: 'o', landed: 'o', frames: [], result: 'score', score: '18/25' },
    ]);
    render(<VisitLog />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]!.textContent).toContain('18/25');
  });

  it('says when there is nothing yet', async () => {
    render(<VisitLog />);
    await waitFor(() => expect(screen.getByText(/No platform visits yet/)).toBeTruthy());
  });
});

describe('Diagnostics: page samples', () => {
  beforeEach(() => fakeBrowser.reset());
  it('shows what a page said, and reminds to check before sending', async () => {
    await appendVisitLog([{ at: '2026-11-08T10:00:00.000Z', key: 'k', title: 'HW11', opened: 'o', frames: [], result: 'none', pages: [{ url: 'https://education.wiley.com/l', text: 'Launching your assignment', buttons: ['Open in new tab'] }] }]);
    render(<VisitLog />);
    expect(await screen.findByText(/Launching your assignment/)).toBeTruthy();
    expect(screen.getByText(/buttons: Open in new tab/)).toBeTruthy();
    expect(screen.getByText(/check the file before sending/i)).toBeTruthy();
  });
});
