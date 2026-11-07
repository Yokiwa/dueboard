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
import { App } from '../../src/entrypoints/dashboard/App';

const cs = course('b:1', 'CS 18000', { name: 'Intro to Java' });
const p3 = item('gradescope:3', 'b:1', 'Project 3', '2026-11-04T18:00:00-05:00', { sourceKeys: ['brightspace:7', 'gradescope:3'] });
const lab = item('b:lab', 'b:1', 'Lab 09', '2026-11-07T23:59:00-05:00');

const withToast = (ui: React.ReactElement) => renderIn('en', <DoneToastProvider>{ui}</DoneToastProvider>);

describe('mark done from the banner', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.useRealTimers());

  it('✓ Done marks every source of the item done and offers undo', async () => {
    withToast(<NextDueBanner item={p3} course={cs} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark done: Project 3' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({ 'brightspace:7': true, 'gradescope:3': true }));
    const toast = screen.getByRole('status');
    expect(within(toast).getByText('Marked done: Project 3')).toBeTruthy();
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('the undo toast disappears after 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToast(<NextDueBanner item={p3} course={cs} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark done: Project 3' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('works without a toast provider (just marks done)', async () => {
    renderIn('en', <NextDueBanner item={p3} course={cs} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark done: Project 3' }));
    await waitFor(async () => expect((await loadStore()).userState.done['gradescope:3']).toBe(true));
  });
});

describe('mark done from course cards', () => {
  beforeEach(() => fakeBrowser.reset());

  it('checking a card item marks it done and it stays on the card, checked and struck through (no toast)', async () => {
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [p3, lab] })} now={NOW} />);
    const card = within(screen.getByRole('article', { name: 'CS 18000' }));
    fireEvent.click(card.getByRole('checkbox', { name: 'Mark done: Lab 09' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({ 'b:lab': true }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a done item that is not past due stays in place on the card, checked; unchecking clears it', async () => {
    await toggleDone(['b:lab'], true);
    const doneLab = { ...lab, doneByUser: true };
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [p3, doneLab] })} now={NOW} />);
    const card = within(screen.getByRole('article', { name: 'CS 18000' }));
    const titles = card.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent);
    expect(titles).toEqual(['Project 3', 'Lab 09']);
    const box = card.getByRole('checkbox', { name: 'Mark done: Lab 09' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
  });

  it('cards leave out done items that are already past due, and undated items', () => {
    const oldDone = item('b:old', 'b:1', 'Old lab', '2026-11-02T23:59:00-05:00', { doneByUser: true });
    const undated = item('b:quiz1', 'b:1', 'Quiz 1', null, { type: 'quiz' });
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [oldDone, p3, undated] })} now={NOW} />);
    const card = within(screen.getByRole('article', { name: 'CS 18000' }));
    expect(card.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent)).toEqual(['Project 3']);
    fireEvent.click(card.getByRole('button', { name: 'Open CS 18000 details' }));
    expect(within(screen.getByRole('dialog')).getByText('Quiz 1')).toBeTruthy();
  });

  it('the course detail lists done items checked and lets you uncheck them', async () => {
    await toggleDone(['b:lab'], true);
    const doneLab = { ...lab, doneByUser: true };
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [p3, doneLab] })} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open CS 18000 details' }));
    const box = within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Mark done: Lab 09' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
  });

  it('submitted items in the detail are checked and locked', () => {
    const sub = { ...lab, submitted: true };
    withToast(<CoursesView dashboard={dash({ courses: [cs], items: [sub] })} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open CS 18000 details' }));
    const box = within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Mark done: Lab 09' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });
});

describe('newtab: marking the next deadline done moves the banner on', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    localStorage.clear();
  });

  it('shows the following deadline after ✓ Done', async () => {
    const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    await patchStore({ syncMeta: { brightspace: { lastSuccess: new Date().toISOString() }, gradescope: { lastSuccess: new Date().toISOString() } } });
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
    fireEvent.click(screen.getByRole('button', { name: 'Mark done: Reflection' }));
    await waitFor(() => expect(screen.getByText('CS 18000 · HW11')).toBeTruthy());
  });
});
