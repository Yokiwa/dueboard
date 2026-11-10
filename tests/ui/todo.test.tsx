import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { renderIn } from './render';
import { TodoView } from '../../src/ui/views/TodoView';
import { ManualItemForm } from '../../src/ui/components/ManualItemForm';
import { ManualLinkForm } from '../../src/ui/components/ManualLinkForm';
import { loadStore, addManualItem, toggleDone } from '../../src/storage/store';
import { NOW, course, item, dash } from './fixtures';

const cs = course('brightspace:1', 'CS 18000');
const ma = course('brightspace:2', 'MA 26100');
const d = dash({
  courses: [cs, ma],
  items: [
    item('brightspace:o', 'brightspace:1', 'Late lab', '2026-11-03T23:59:00-05:00'),
    item('brightspace:t', 'brightspace:1', 'Project 3', '2026-11-04T23:59:00-05:00', { sourceKeys: ['brightspace:t', 'gradescope:9'] }),
    item('brightspace:m', 'brightspace:2', 'WebAssign 14.3', '2026-11-05T23:59:00-05:00'),
    item('brightspace:w', 'brightspace:2', 'Quiz 6', '2026-11-08T23:59:00-05:00'),
    item('brightspace:l', 'brightspace:2', 'Exam 2', '2026-11-20T19:00:00-05:00'),
    item('brightspace:n', 'brightspace:1', 'Reading', null),
    item('brightspace:s', 'brightspace:1', 'Lab 08', '2026-11-04T08:00:00-05:00', { submitted: true }),
    item('manual:abc', 'brightspace:2', 'Office hours prep', '2026-11-06T12:00:00-05:00', { type: 'manual', sources: ['manual'], sourceKeys: ['manual:abc'], doneByUser: true }),
  ],
});

const group = (name: string) => screen.getByRole('region', { name });
const titles = (el: HTMLElement) => within(el).queryAllByTestId('todo-title').map((x) => x.textContent);

describe('TodoView', () => {
  beforeEach(() => fakeBrowser.reset());

  it('lists items sorted, grouped Overdue / Today / Tomorrow / This week / Later / No due date', () => {
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    expect(titles(group('Overdue'))).toEqual(['Late lab']);
    expect(titles(group('Today'))).toEqual(['Project 3']);
    expect(titles(group('Tomorrow'))).toEqual(['WebAssign 14.3']);
    expect(titles(group('This week'))).toEqual(['Office hours prep', 'Quiz 6']);
    expect(titles(group('Later'))).toEqual(['Exam 2']);
    expect(titles(group('No due date'))).toEqual(['Reading']);
    expect(within(group('Today')).getByText('CS 18000')).toBeTruthy();
  });

  it('shows the score of finished work in its badge', () => {
    const scored = dash({
      courses: [ma],
      items: [item('brightspace:z', 'brightspace:2', 'Wiley HW', '2026-11-20T19:00:00-05:00', { doneByUser: true, score: { text: '18/25', from: 'WileyPLUS' } })],
    });
    renderIn('en', <TodoView dashboard={scored} now={NOW} />);
    expect(screen.getByText('Done · 18/25')).toBeTruthy();
  });

  it('checkbox toggles done via toggleDone(item.sourceKeys)', async () => {
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Project 3' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({ 'brightspace:t': true, 'gradescope:9': true }));
  });

  it('done items that are not past due stay in their group, checked', () => {
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    expect(titles(group('This week'))).toEqual(['Office hours prep', 'Quiz 6']);
    expect((screen.getByRole('checkbox', { name: 'Office hours prep' }) as HTMLInputElement).checked).toBe(true);
  });

  it('completed section (collapsed) only holds finished items whose due time has passed', () => {
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    const details = screen.getByText('Completed (1)').closest('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getAllByTestId('todo-title').map((x) => x.textContent)).toEqual(['Lab 08']);
  });

  it('unchecking a done item clears its done flag', async () => {
    await toggleDone(['manual:abc'], true);
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Office hours prep' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
  });

  it('submitted items show Submitted and are checked and locked', () => {
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    const box = screen.getByRole('checkbox', { name: 'Lab 08' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(screen.getByText('Submitted')).toBeTruthy();
  });

  it('manual items can be deleted', async () => {
    const id = await addManualItem({ courseId: 'brightspace:2', title: 'X', dueAt: null, url: '' });
    const withManual = dash({ ...d, items: [item(id, 'brightspace:2', 'X', null, { type: 'manual', sources: ['manual'], sourceKeys: [id] })] });
    renderIn('en', <TodoView dashboard={withManual} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete X' }));
    await waitFor(async () => expect((await loadStore()).manualItems).toEqual([]));
  });

  it('empty state', () => {
    renderIn('en', <TodoView dashboard={dash({})} now={NOW} />);
    expect(screen.getByText('Nothing to do. Enjoy the break.')).toBeTruthy();
  });

  it('Add assignment button opens the manual item form', () => {
    renderIn('en', <TodoView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add assignment' }));
    expect(screen.getByRole('form', { name: 'Add assignment' })).toBeTruthy();
  });
});

describe('ManualItemForm', () => {
  beforeEach(() => fakeBrowser.reset());

  it('manual item form requires course and title, due optional; saved item appears', async () => {
    let closed = false;
    renderIn('en', <ManualItemForm courses={[cs, ma]} onDone={() => (closed = true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe('Choose a course and enter a title');
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'brightspace:2' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'WebAssign 14.3' } });
    fireEvent.change(screen.getByLabelText('Due (optional)'), { target: { value: '2026-11-07T23:59' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await loadStore()).manualItems).toHaveLength(1));
    const saved = (await loadStore()).manualItems[0]!;
    expect(saved).toMatchObject({ courseId: 'brightspace:2', title: 'WebAssign 14.3', dueAt: new Date('2026-11-08T04:59:00.000Z').toISOString() });
    expect(saved.url).toBe(ma.url);
    expect(closed).toBe(true);
  });

  it('fixed course hides the course picker', () => {
    renderIn('en', <ManualItemForm courses={[cs, ma]} courseId="brightspace:1" onDone={() => {}} />);
    expect(screen.queryByLabelText('Course')).toBeNull();
  });
});

describe('ManualLinkForm', () => {
  beforeEach(() => fakeBrowser.reset());

  it('manual link form rejects non-http url', async () => {
    renderIn('en', <ManualLinkForm courseId="brightspace:1" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Piazza' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a URL starting with http:// or https://');
    expect((await loadStore()).manualLinks).toEqual([]);
  });

  it('saves a link with chosen category', async () => {
    renderIn('en', <ManualLinkForm courseId="brightspace:1" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Piazza' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://piazza.com/class/x' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'discussion' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await loadStore()).manualLinks).toEqual([
        { courseId: 'brightspace:1', label: 'Piazza', url: 'https://piazza.com/class/x', category: 'discussion', source: 'manual' },
      ]),
    );
  });
});
