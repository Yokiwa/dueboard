import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';

vi.mock('../../src/ui/config', () => ({ FEEDBACK_URL: 'https://forms.gle/test' }));
import { Settings } from '../../src/entrypoints/options/Settings';
import { loadStore, patchStore, saveSnapshot } from '../../src/storage/store';
import { PALETTE } from '../../src/core/dashboard';

async function seed() {
  await patchStore({ settings: { language: 'zh' } });
  await saveSnapshot('brightspace', {
    syncedAt: 'x', partial: [], items: [], links: [],
    courses: [
      { source: 'brightspace', sourceCourseId: '1', name: 'CS 18000 Java', code: 'CS 18000', url: 'u1' },
      { source: 'brightspace', sourceCourseId: '2', name: 'PHYS 17200', code: 'PHYS 17200', url: 'u2' },
      { source: 'brightspace', sourceCourseId: '3', name: 'Fall 2026 ISS Training WL', code: null, url: 'u3' },
    ],
  });
  await saveSnapshot('gradescope', {
    syncedAt: 'x', partial: [], items: [], links: [],
    courses: [{ source: 'gradescope', sourceCourseId: '9', name: 'Physics Lab', code: null, url: 'g9' }],
  });
}

const row = (code: string) => screen.getByRole('listitem', { name: code });

describe('Settings', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '1.0.0' } as never);
    await seed();
  });

  it('hide course toggles userState.hidden', async () => {
    render(<Settings />);
    await waitFor(() => row('CS 18000'));
    fireEvent.click(within(row('CS 18000')).getByRole('checkbox', { name: '显示 CS 18000' }));
    await waitFor(async () => expect((await loadStore()).userState.hidden).toEqual({ 'brightspace:1': true }));
    fireEvent.click(within(row('CS 18000')).getByRole('checkbox', { name: '显示 CS 18000' }));
    await waitFor(async () => expect((await loadStore()).userState.hidden).toEqual({}));
  });

  it('color picker from palette sets userState.colors', async () => {
    render(<Settings />);
    await waitFor(() => row('CS 18000'));
    const swatches = within(row('CS 18000')).getAllByRole('button', { name: /颜色/ });
    expect(swatches).toHaveLength(PALETTE.length);
    fireEvent.click(swatches[3]!);
    await waitFor(async () => expect((await loadStore()).userState.colors).toEqual({ 'brightspace:1': PALETTE[3] }));
  });

  it('language select persists and re-renders in English', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('界面语言'));
    fireEvent.change(screen.getByLabelText('界面语言'), { target: { value: 'en' } });
    await waitFor(() => expect(screen.getByLabelText('Language')).toBeTruthy());
    expect((await loadStore()).settings.language).toBe('en');
  });

  it('has no new-tab section any more', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('界面语言'));
    expect(screen.queryByText('新标签页')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('merge gradescope course into brightspace course writes userState.merges', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('Physics Lab 合并到'));
    fireEvent.change(screen.getByLabelText('Physics Lab 合并到'), { target: { value: 'brightspace:2' } });
    await waitFor(async () => expect((await loadStore()).userState.merges).toEqual({ 'gradescope:9': 'brightspace:2' }));
    fireEvent.change(screen.getByLabelText('Physics Lab 合并到'), { target: { value: '' } });
    await waitFor(async () => expect((await loadStore()).userState.merges).toEqual({}));
  });

  it('feedback link points to FEEDBACK_URL constant', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByRole('link', { name: '反馈问题或建议' }));
    expect((screen.getByRole('link', { name: '反馈问题或建议' }) as HTMLAnchorElement).href).toBe('https://forms.gle/test');
  });

  it('links to the diagnostics tool and shows the version', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByRole('link', { name: '诊断工具' }));
    expect(screen.getByText('版本 1.0.0')).toBeTruthy();
    expect((screen.getByRole('link', { name: '诊断工具' }) as HTMLAnchorElement).href).toContain('/diagnostics.html');
  });

  it('non-course entries are listed unchecked; checking one shows it', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByRole('checkbox', { name: '显示 Fall 2026 ISS Training WL' }));
    const box = screen.getByRole('checkbox', { name: '显示 Fall 2026 ISS Training WL' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).userState.shown).toEqual({ 'brightspace:3': true }));
  });
});
