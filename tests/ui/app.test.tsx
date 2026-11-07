import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => null) }));
import { App } from '../../src/entrypoints/dashboard/App';
import { sendToBackground } from '../../src/ui/messaging';
import { patchStore, saveSnapshot } from '../../src/storage/store';

const soon = () => new Date(Date.now() + 3 * 3600_000).toISOString();

async function seed() {
  await saveSnapshot('brightspace', {
    syncedAt: new Date().toISOString(),
    courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'CS 18000', code: 'CS 18000', url: 'https://purdue.brightspace.com/d2l/home/1' }],
    items: [{ source: 'brightspace', sourceItemId: 'dropbox:1', sourceCourseId: '1', title: 'Project 3', type: 'assignment', dueAt: soon(), url: 'https://x/1', submitted: false }],
    links: [],
    partial: [],
  });
  await patchStore({ syncMeta: { brightspace: { lastSuccess: new Date().toISOString() }, gradescope: { lastSuccess: new Date().toISOString() } } });
}

describe('dashboard App', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    localStorage.clear();
  });

  it('renders header, next-due banner, tabs and stat chips from storage', async () => {
    await seed();
    render(<App />);
    await waitFor(() => expect(screen.getByText('CS 18000 · Project 3')).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('1 due this week');
    expect(screen.getByRole('tab', { name: 'Courses' })).toBeTruthy();
    expect(screen.getByText('1 due in 48 h')).toBeTruthy();
  });

  it('remembers the chosen view in localStorage', async () => {
    await seed();
    render(<App />);
    await waitFor(() => screen.getByRole('tab', { name: 'Calendar' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(localStorage.getItem('dueboard.view')).toBe('calendar');
    expect(screen.getByRole('tab', { name: 'Calendar' }).getAttribute('aria-selected')).toBe('true');
  });

  it('onboarding asks only for Brightspace; Start sync sends sync', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    expect((screen.getByRole('link', { name: 'Open Brightspace' }) as HTMLAnchorElement).href).toBe('https://purdue.brightspace.com/d2l/home');
    expect(screen.queryByRole('link', { name: 'Open Gradescope' })).toBeNull();
    expect(screen.queryByText(/Gradescope|Pearson|Wiley/)).toBeNull();
    vi.mocked(sendToBackground).mockResolvedValueOnce({ brightspace: 'not_logged_in', gradescope: 'not_logged_in' });
    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));
    expect(sendToBackground).toHaveBeenLastCalledWith({ type: 'sync' });
    await waitFor(() => expect(screen.getByText('Brightspace: not signed in yet')).toBeTruthy());
    expect(screen.queryByText(/Gradescope/)).toBeNull();
  });

  it('onboarding mentions another platform only when it was found and read', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    vi.mocked(sendToBackground).mockResolvedValueOnce({ brightspace: 'ok', gradescope: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(screen.getByText('Gradescope: read')).toBeTruthy());
  });

  it('onboarding disappears once a snapshot arrives', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    await seed();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Courses' })).toBeTruthy());
  });
});
