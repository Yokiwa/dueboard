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

  it('has no Pomodoro timer (removed)', async () => {
    await seed();
    render(<App />);
    await waitFor(() => expect(screen.getByText('CS 18000 · Project 3')).toBeTruthy());
    expect(screen.queryByRole('group', { name: 'Timer mode' })).toBeNull();
    expect(screen.queryByText(/Pomodoro/i)).toBeNull();
  });

  it('remembers the chosen view in localStorage', async () => {
    await seed();
    render(<App />);
    await waitFor(() => screen.getByRole('tab', { name: 'Calendar' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(localStorage.getItem('dueboard.view')).toBe('calendar');
    expect(screen.getByRole('tab', { name: 'Calendar' }).getAttribute('aria-selected')).toBe('true');
  });

  it('onboarding has one Log in button; signed in starts the sync', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    expect(screen.queryByRole('link', { name: 'Open Brightspace' })).toBeNull();
    expect(screen.queryByText(/may briefly use this tab/)).toBeNull();
    expect(screen.getByText('Already signed in? This starts reading your courses right away.')).toBeTruthy();
    vi.mocked(sendToBackground).mockResolvedValueOnce({ signedIn: true }).mockResolvedValueOnce({ brightspace: 'not_logged_in', gradescope: 'not_logged_in' });
    fireEvent.click(screen.getByRole('button', { name: 'Log in to Brightspace' }));
    expect(sendToBackground).toHaveBeenCalledWith({ type: 'beginLogin' });
    await waitFor(() => expect(sendToBackground).toHaveBeenLastCalledWith({ type: 'sync', trigger: 'manual' }));
    await waitFor(() => expect(screen.getByText('Brightspace: not signed in yet')).toBeTruthy());
    expect(screen.queryByText(/Gradescope/)).toBeNull();
  });

  it('signed out: login starts and nothing more happens in the page', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    vi.mocked(sendToBackground).mockClear();
    vi.mocked(sendToBackground).mockResolvedValueOnce({ signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'Log in to Brightspace' }));
    await waitFor(() => expect(sendToBackground).toHaveBeenCalledWith({ type: 'beginLogin' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(sendToBackground).toHaveBeenCalledTimes(1);
  });

  it('?start=1 starts the sync on mount, once, and removes the parameter', async () => {
    history.replaceState(null, '', '/dashboard.html?start=1');
    vi.mocked(sendToBackground).mockClear();
    vi.mocked(sendToBackground).mockImplementation(async (m) => (m.type === 'sync' ? { brightspace: 'ok', gradescope: 'ok' } : null) as never);
    render(<App />);
    await waitFor(() => expect(sendToBackground).toHaveBeenCalledWith({ type: 'sync', trigger: 'manual' }));
    expect(location.search).toBe('');
    expect(vi.mocked(sendToBackground).mock.calls.filter(([m]) => m.type === 'sync')).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('Gradescope: read')).toBeTruthy());
    vi.mocked(sendToBackground).mockImplementation(async () => null);
  });

  it('?start=1: the button reads "Reading your courses…" while syncing, and a failed sync shows an error', async () => {
    history.replaceState(null, '', '/dashboard.html?start=1');
    let reject!: (e: Error) => void;
    vi.mocked(sendToBackground).mockImplementation((m) => (m.type === 'sync' ? new Promise((_, rj) => (reject = rj)) : Promise.resolve(null)) as never);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reading your courses…' })).toBeTruthy());
    reject(new Error('boom'));
    await waitFor(() => expect(screen.getByText('Brightspace: failed (network)')).toBeTruthy());
    vi.mocked(sendToBackground).mockImplementation(async () => null);
  });

  it('onboarding mentions another platform only when it was found and read', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    vi.mocked(sendToBackground).mockResolvedValueOnce({ signedIn: true }).mockResolvedValueOnce({ brightspace: 'ok', gradescope: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: 'Log in to Brightspace' }));
    await waitFor(() => expect(screen.getByText('Gradescope: read')).toBeTruthy());
  });

  it('onboarding disappears once a snapshot arrives', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: 'Welcome to DueBoard' }));
    await seed();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Courses' })).toBeTruthy());
  });
});

describe('dashboard App: site access', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    localStorage.clear();
  });

  it('asks for platforms the courses use, and for missing required access', async () => {
    const { browser } = await import('wxt/browser');
    (browser.permissions as unknown as { getAll: unknown }).getAll = vi.fn(async () => ({ origins: ['https://purdue.brightspace.com/*'], permissions: [] }));
    await seed();
    const { loadStore } = await import('../../src/storage/store');
    const s = await loadStore();
    s.snapshots.brightspace!.links = [{ source: 'brightspace', sourceCourseId: '1', title: 'ALEKS', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=A' }];
    await patchStore({ snapshots: s.snapshots });
    render(<App />);
    await waitFor(() => expect(screen.getByText('DueBoard found ALEKS in your courses. Allow it to read their due dates?')).toBeTruthy());
    expect(screen.getByText(/^DueBoard can't reach .*Gradescope.*Pearson.*\. Allow access to keep syncing\.$/)).toBeTruthy();
  });
});
