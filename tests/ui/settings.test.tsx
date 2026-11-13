import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';

vi.mock('../../src/ui/config', () => ({ FEEDBACK_URL: 'https://forms.gle/test' }));
import { Settings } from '../../src/entrypoints/options/Settings';
import { loadStore, patchStore, saveSnapshot } from '../../src/storage/store';
import { PALETTE } from '../../src/core/dashboard';

async function seed() {
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
    fireEvent.click(within(row('CS 18000')).getByRole('checkbox', { name: 'Show CS 18000' }));
    await waitFor(async () => expect((await loadStore()).userState.hidden).toEqual({ 'brightspace:1': true }));
    fireEvent.click(within(row('CS 18000')).getByRole('checkbox', { name: 'Show CS 18000' }));
    await waitFor(async () => expect((await loadStore()).userState.hidden).toEqual({}));
  });

  it('color picker from palette sets userState.colors', async () => {
    render(<Settings />);
    await waitFor(() => row('CS 18000'));
    const swatches = within(row('CS 18000')).getAllByRole('button', { name: /color/ });
    expect(swatches).toHaveLength(PALETTE.length);
    fireEvent.click(swatches[3]!);
    await waitFor(async () => expect((await loadStore()).userState.colors).toEqual({ 'brightspace:1': PALETTE[3] }));
  });

  it('has no language or new-tab settings (English-only UI, dashboard opens from the toolbar)', async () => {
    render(<Settings />);
    await waitFor(() => row('CS 18000'));
    expect(screen.queryByLabelText('Language')).toBeNull();
    expect(screen.queryByText('New tab')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('merge gradescope course into brightspace course writes userState.merges', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('Merge Physics Lab into'));
    fireEvent.change(screen.getByLabelText('Merge Physics Lab into'), { target: { value: 'brightspace:2' } });
    await waitFor(async () => expect((await loadStore()).userState.merges).toEqual({ 'gradescope:9': 'brightspace:2' }));
    fireEvent.change(screen.getByLabelText('Merge Physics Lab into'), { target: { value: '' } });
    await waitFor(async () => expect((await loadStore()).userState.merges).toEqual({}));
  });

  it('chooses where finished work shows on the Courses page', async () => {
    render(<Settings />);
    const select = (await screen.findByLabelText('Finished work on the Courses page')) as HTMLSelectElement;
    expect(select.value).toBe('card');
    fireEvent.change(select, { target: { value: 'section' } });
    await waitFor(async () => expect((await loadStore()).settings.completed).toBe('section'));
  });

  it('chooses a dashboard theme and links back to the dashboard', async () => {
    render(<Settings />);
    const dusk = await screen.findByRole('button', { name: /Dusk Lullaby/ });
    fireEvent.click(dusk);
    await waitFor(async () => expect((await loadStore()).settings.theme).toBe('dusk-lullaby'));
    expect(screen.getByRole('link', { name: 'Back to dashboard' }).getAttribute('href')).toContain('/dashboard.html');
  });

  it('feedback link points to FEEDBACK_URL constant', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByRole('link', { name: 'Send feedback' }));
    expect((screen.getByRole('link', { name: 'Send feedback' }) as HTMLAnchorElement).href).toBe('https://forms.gle/test');
  });

  it('links to the diagnostics tool and shows the version', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByRole('link', { name: 'Diagnostics' }));
    expect(screen.getByText('Version 1.0.0')).toBeTruthy();
    expect((screen.getByRole('link', { name: 'Diagnostics' }) as HTMLAnchorElement).href).toContain('/diagnostics.html');
  });

  it('non-course entries are listed unchecked; checking one shows it', async () => {
    render(<Settings />);
    await waitFor(() => screen.getByRole('checkbox', { name: 'Show Fall 2026 ISS Training WL' }));
    const box = screen.getByRole('checkbox', { name: 'Show Fall 2026 ISS Training WL' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).userState.shown).toEqual({ 'brightspace:3': true }));
  });

  it('reading platforms: new option wording, automatic by default, window fallback checkbox saves', async () => {
    render(<Settings />);
    await waitFor(() => row('CS 18000'));
    const select = screen.getByRole('combobox', { name: /Read homework pages from your platforms/ }) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Automatically, in the background', 'Only when I click Refresh', 'Never']);
    expect(select.value).toBe('auto');
    const box = screen.getByRole('checkbox', { name: "Use a small minimized window for pages that can't be read in the background" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).settings.windowFallback).toBe(false));
    fireEvent.change(select, { target: { value: 'off' } });
    await waitFor(() => expect(box.disabled).toBe(true));
    expect(box.checked).toBe(false);
    expect(box.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Off while reading is set to Never.')).toBeTruthy();
  });
});
