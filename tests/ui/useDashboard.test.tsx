import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => null) }));
import { sendToBackground } from '../../src/ui/messaging';
import { useDashboard } from '../../src/ui/hooks/useDashboard';
import { saveSnapshot } from '../../src/storage/store';

function Harness() {
  const { dashboard, syncing, refresh } = useDashboard();
  return (
    <div>
      <span data-testid="courses">{dashboard ? dashboard.courses.length : 'loading'}</span>
      <span data-testid="syncing">{String(syncing)}</span>
      <button type="button" onClick={refresh}>refresh</button>
    </div>
  );
}

describe('useDashboard', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(sendToBackground).mockClear();
  });

  it('loads local data, then asks the background to sync if stale', async () => {
    await saveSnapshot('brightspace', { syncedAt: 'x', courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'CS 18000', code: 'CS 18000', url: '' }], items: [], links: [], partial: [] });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('courses').textContent).toBe('1'));
    expect(sendToBackground).toHaveBeenCalledWith({ type: 'syncIfStale' });
  });

  it('recomputes when storage changes', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('courses').textContent).toBe('0'));
    await act(() =>
      saveSnapshot('gradescope', { syncedAt: 'x', courses: [{ source: 'gradescope', sourceCourseId: '9', name: 'PHYS', code: null, url: '' }], items: [], links: [], partial: [] }),
    );
    await waitFor(() => expect(screen.getByTestId('courses').textContent).toBe('1'));
  });

  it("refresh button sends {type:'sync'} and shows syncing state", async () => {
    let finish: (v: unknown) => void = () => {};
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('syncing').textContent).toBe('false'));
    vi.mocked(sendToBackground).mockImplementationOnce(() => new Promise((r) => (finish = r)));
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(sendToBackground).toHaveBeenLastCalledWith({ type: 'sync' });
    expect(screen.getByTestId('syncing').textContent).toBe('true');
    await act(async () => finish({}));
    expect(screen.getByTestId('syncing').textContent).toBe('false');
  });
});
