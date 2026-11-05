import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => null) }));
import { PopupApp } from '../../src/entrypoints/popup/App';
import { patchStore, saveSnapshot } from '../../src/storage/store';

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe('popup', () => {
  beforeEach(() => fakeBrowser.reset());

  it('shows next due banner, 5 nearest items, 打开完整面板 button', async () => {
    await patchStore({ settings: { language: 'zh', newtabMode: 'dashboard' } });
    await saveSnapshot('brightspace', {
      syncedAt: new Date().toISOString(),
      courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'CS 18000', code: 'CS 18000', url: 'u' }],
      items: Array.from({ length: 7 }, (_, i) => ({
        source: 'brightspace' as const, sourceItemId: `d${i}`, sourceCourseId: '1', title: `HW ${i}`, type: 'assignment' as const,
        dueAt: inHours(2 + i * 24), url: `https://x/${i}`, submitted: false,
      })),
      links: [],
      partial: [],
    });
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    render(<PopupApp />);
    await waitFor(() => expect(screen.getByText('CS 18000 · HW 0')).toBeTruthy());
    expect(screen.getAllByTestId('popup-item').map((el) => el.querySelector('[data-title]')?.textContent)).toEqual(['HW 1', 'HW 2', 'HW 3', 'HW 4', 'HW 5']);
    fireEvent.click(screen.getByRole('button', { name: '打开完整面板' }));
    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/newtab.html') });
  });

  it('empty state still offers the full dashboard', async () => {
    await patchStore({ settings: { language: 'en', newtabMode: 'dashboard' } });
    render(<PopupApp />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open full dashboard' })).toBeTruthy());
    expect(screen.getByText('Nothing to do. Enjoy the break.')).toBeTruthy();
  });
});
