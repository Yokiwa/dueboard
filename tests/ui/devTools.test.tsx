import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => null) }));
vi.mock('../../src/ui/devExport', () => ({
  captureActivePage: vi.fn(async () => ({ url: 'https://mylab.pearson.com/Student/DoAssignments.aspx?view=all', html: '<td>HW 13.1</td><a>me@purdue.edu</a>' })),
  downloadText: vi.fn(),
}));
import { captureActivePage, downloadText } from '../../src/ui/devExport';
import { PopupApp } from '../../src/entrypoints/popup/App';
import { patchStore, saveSnapshot } from '../../src/storage/store';

describe('popup developer tools', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    vi.mocked(downloadText).mockClear();
    await patchStore({ settings: { language: 'zh' } });
  });

  it('is a collapsed section with two export buttons', async () => {
    render(<PopupApp />);
    const summary = await screen.findByText('开发者工具');
    expect((summary.closest('details') as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByRole('button', { name: '导出当前页面' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '导出课程链接' })).toBeTruthy();
  });

  it('导出当前页面 downloads the scrubbed page named after its host', async () => {
    render(<PopupApp />);
    fireEvent.click(await screen.findByRole('button', { name: '导出当前页面' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [name, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('dueboard-page-mylab.pearson.com.html');
    expect(text).toContain('HW 13.1');
    expect(text).not.toContain('me@purdue.edu');
    expect(await screen.findByText('已下载：dueboard-page-mylab.pearson.com.html')).toBeTruthy();
  });

  it('shows an error for pages that cannot be read', async () => {
    vi.mocked(captureActivePage).mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));
    render(<PopupApp />);
    fireEvent.click(await screen.findByRole('button', { name: '导出当前页面' }));
    expect(await screen.findByText('这个页面无法导出')).toBeTruthy();
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('导出课程链接 downloads the links bundle', async () => {
    await saveSnapshot('brightspace', {
      syncedAt: 'x', partial: [], items: [],
      courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA 261 REC', code: 'MA 26100', url: 'u' }],
      links: [{ source: 'brightspace', sourceCourseId: '1', title: 'Access Pearson', url: '/d2l/le/lti/9' }],
    });
    render(<PopupApp />);
    fireEvent.click(await screen.findByRole('button', { name: '导出课程链接' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [name, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('dueboard-links.json');
    expect(JSON.parse(text).courses[0].links).toEqual([{ title: 'Access Pearson', url: '/d2l/le/lti/9' }]);
  });
});
