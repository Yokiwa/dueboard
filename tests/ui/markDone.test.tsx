import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act, render } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { renderIn } from './render';
import { NextDueBanner } from '../../src/ui/components/NextDueBanner';
import { DoneToastProvider } from '../../src/ui/components/DoneToast';
import { CoursesView } from '../../src/ui/views/CoursesView';
import { loadStore, toggleDone, patchStore, saveSnapshot } from '../../src/storage/store';
import { NOW, course, item, dash } from './fixtures';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => null) }));
import { App } from '../../src/entrypoints/newtab/App';

const cs = course('b:1', 'CS 18000', { name: 'Java 编程入门' });
const p3 = item('gradescope:3', 'b:1', 'Project 3', '2026-11-04T18:00:00-05:00', { sourceKeys: ['brightspace:7', 'gradescope:3'] });
const lab = item('b:lab', 'b:1', 'Lab 09', '2026-11-07T23:59:00-05:00');

const withToast = (ui: React.ReactElement) => renderIn('zh', <DoneToastProvider>{ui}</DoneToastProvider>);

describe('mark done from the banner', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.useRealTimers());

  it('✓ 完成 marks every source of the item done and offers undo', async () => {
    withToast(<NextDueBanner item={p3} course={cs} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '标记完成：Project 3' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({ 'brightspace:7': true, 'gradescope:3': true }));
    const toast = screen.getByRole('status');
    expect(within(toast).getByText('已标记完成：Project 3')).toBeTruthy();
    fireEvent.click(within(toast).getByRole('button', { name: '撤销' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('the undo toast disappears after 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToast(<NextDueBanner item={p3} course={cs} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '标记完成：Project 3' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('works without a toast provider (just marks done)', async () => {
    renderIn('zh', <NextDueBanner item={p3} course={cs} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '标记完成：Project 3' }));
    await waitFor(async () => expect((await loadStore()).userState.done['gradescope:3']).toBe(true));
  });
});

describe('mark done from course cards', () => {
  beforeEach(() => fakeBrowser.reset());

  it('each pending card item has a checkbox that marks it done with undo', async () => {
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [p3, lab] })} now={NOW} />);
    const card = within(screen.getByRole('article', { name: 'CS 18000' }));
    const box = card.getByRole('checkbox', { name: '标记完成：Lab 09' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({ 'b:lab': true }));
    expect(screen.getByText('已标记完成：Lab 09')).toBeTruthy();
  });

  it('the course detail lists done items checked and lets you uncheck them', async () => {
    await toggleDone(['b:lab'], true);
    const doneLab = { ...lab, doneByUser: true };
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [p3, doneLab] })} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '查看 CS 18000 详情' }));
    const box = within(screen.getByRole('dialog')).getByRole('checkbox', { name: '标记完成：Lab 09' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
  });

  it('submitted items in the detail are checked and locked', () => {
    const sub = { ...lab, submitted: true };
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [sub] })} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '查看 CS 18000 详情' }));
    const box = within(screen.getByRole('dialog')).getByRole('checkbox', { name: '标记完成：Lab 09' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });
});

describe('newtab: marking the next deadline done moves the banner on', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    localStorage.clear();
  });

  it('shows the following deadline after ✓ 完成', async () => {
    const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    await patchStore({ settings: { language: 'zh', newtabMode: 'dashboard' }, syncMeta: { brightspace: { lastSuccess: new Date().toISOString() }, gradescope: { lastSuccess: new Date().toISOString() } } });
    await saveSnapshot('brightspace', {
      syncedAt: new Date().toISOString(), partial: [], links: [],
      courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'CS 18000', code: 'CS 18000', url: 'u' }],
      items: [
        { source: 'brightspace', sourceItemId: 'a', sourceCourseId: '1', title: 'Reflection', type: 'event', dueAt: at(5), url: 'https://x/a', submitted: false },
        { source: 'brightspace', sourceItemId: 'b', sourceCourseId: '1', title: 'HW11', type: 'assignment', dueAt: at(50), url: 'https://x/b', submitted: false },
      ],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('CS 18000 · Reflection')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '标记完成：Reflection' }));
    await waitFor(() => expect(screen.getByText('CS 18000 · HW11')).toBeTruthy());
  });
});
