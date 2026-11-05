import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => null) }));
import { App } from '../../src/entrypoints/newtab/App';
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

describe('newtab App', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    localStorage.clear();
  });

  it('renders header, next-due banner, tabs and stat chips from storage', async () => {
    await seed();
    await patchStore({ settings: { language: 'zh', newtabMode: 'dashboard' } });
    render(<App />);
    await waitFor(() => expect(screen.getByText('CS 18000 · Project 3')).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('本周还有 1 项待交');
    expect(screen.getByRole('tab', { name: '课程' })).toBeTruthy();
    expect(screen.getByText('48 小时内 1 项')).toBeTruthy();
  });

  it('uses English when the setting says so', async () => {
    await seed();
    await patchStore({ settings: { language: 'en', newtabMode: 'dashboard' } });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Courses' })).toBeTruthy());
  });

  it('remembers the chosen view in localStorage', async () => {
    await seed();
    await patchStore({ settings: { language: 'zh', newtabMode: 'dashboard' } });
    render(<App />);
    await waitFor(() => screen.getByRole('tab', { name: '日历' }));
    fireEvent.click(screen.getByRole('tab', { name: '日历' }));
    expect(localStorage.getItem('dueboard.view')).toBe('calendar');
    expect(screen.getByRole('tab', { name: '日历' }).getAttribute('aria-selected')).toBe('true');
  });

  it('blank mode renders BlankTab with 打开 DueBoard button that switches to dashboard for this tab', async () => {
    await seed();
    await patchStore({ settings: { language: 'zh', newtabMode: 'blank' } });
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: '打开 DueBoard' }));
    expect(screen.queryByRole('tab', { name: '课程' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '打开 DueBoard' }));
    expect(screen.getByRole('tab', { name: '课程' })).toBeTruthy();
  });

  it('onboarding shown when no snapshots yet; 开始同步 sends sync', async () => {
    await patchStore({ settings: { language: 'zh', newtabMode: 'dashboard' } });
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: '欢迎使用 DueBoard' }));
    expect((screen.getByRole('link', { name: '打开 Brightspace' }) as HTMLAnchorElement).href).toBe('https://purdue.brightspace.com/d2l/home');
    expect((screen.getByRole('link', { name: '打开 Gradescope' }) as HTMLAnchorElement).href).toBe('https://www.gradescope.com/');
    vi.mocked(sendToBackground).mockResolvedValueOnce({ brightspace: 'not_logged_in', gradescope: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    expect(sendToBackground).toHaveBeenLastCalledWith({ type: 'sync' });
    await waitFor(() => expect(screen.getByText('Brightspace：还没登录')).toBeTruthy());
  });

  it('onboarding disappears once a snapshot arrives', async () => {
    await patchStore({ settings: { language: 'zh', newtabMode: 'dashboard' } });
    render(<App />);
    await waitFor(() => screen.getByRole('heading', { name: '欢迎使用 DueBoard' }));
    await seed();
    await waitFor(() => expect(screen.getByRole('tab', { name: '课程' })).toBeTruthy());
  });
});
