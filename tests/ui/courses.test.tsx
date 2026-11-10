import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addManualLink, loadStore, toggleDone } from '../../src/storage/store';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { renderIn } from './render';
import { CoursesView } from '../../src/ui/views/CoursesView';
import { NOW, course, item, link, dash } from './fixtures';

const cs = course('b:1', 'CS 18000', { color: '#EA580C', name: 'Intro to Java' });
const ma = course('b:2', 'MA 26100');
const com = course('b:3', 'COM 11400', { partial: true });
const d = dash({
  courses: [cs, ma, com],
  items: [
    item('i1', 'b:1', 'Project 3', '2026-11-04T18:00:00-05:00', { sources: ['gradescope'] }),
    item('i2', 'b:1', 'Lab 09', '2026-11-07T23:59:00-05:00'),
    item('i3', 'b:1', 'Quiz 6', '2026-11-08T23:59:00-05:00'),
    item('i4', 'b:1', 'Lab 10', '2026-11-14T23:59:00-05:00'),
    item('i5', 'b:1', 'Old lab', '2026-11-02T23:59:00-05:00', { doneByUser: true }),
    item('i6', 'b:2', 'WebAssign 14.3', '2026-11-05T23:59:00-05:00', { submitted: true }),
    item('i7', 'b:1', 'Late lab', '2026-10-30T23:59:00-05:00'),
  ],
  links: [
    link('b:1', 'Brightspace', 'lms'),
    link('b:1', 'Gradescope', 'homework'),
    link('b:1', 'zyBooks', 'textbook'),
    link('b:1', 'Ed', 'discussion'),
    link('b:2', 'Brightspace', 'lms'),
  ],
});

const card = (code: string) => screen.getByRole('article', { name: code });

describe('CoursesView', () => {
  it('card shows code, name, color dot, the next 7 days of unfinished work, finished work at the bottom, and all links', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    const c = within(card('CS 18000'));
    expect(c.getByText('Intro to Java')).toBeTruthy();
    expect((c.getByTestId('course-dot') as HTMLElement).style.background.toLowerCase()).toMatch(/#ea580c|rgb\(234, 88, 12\)/);
    expect(c.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent)).toEqual(['Project 3', 'Lab 09', 'Quiz 6', 'Old lab']);
    expect((c.getByRole('checkbox', { name: 'Mark done: Old lab' }) as HTMLInputElement).checked).toBe(true);
    expect(c.getByText('Gradescope · Today 6:00 PM')).toBeTruthy();
    expect(c.getByText('in 6 h')).toBeTruthy();
    expect(within(c.getByRole('group', { name: 'Shortcuts' })).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Brightspace',
      'Gradescope',
      'zyBooks',
      'Ed',
    ]);
  });

  it('card with nothing in the next 7 days says so', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    expect(within(card('COM 11400')).getByText('Nothing due through Nov 11')).toBeTruthy();
  });

  it('when everything in the window is finished, the card says so', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    expect(within(card('MA 26100')).getByText('All done through Nov 11')).toBeTruthy();
  });

  it('overdue work stays off the card; "1 overdue" opens the detail', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    const c = within(card('CS 18000'));
    expect(c.queryByText('Late lab')).toBeNull();
    fireEvent.click(c.getByRole('button', { name: '1 overdue' }));
    expect(screen.getByRole('dialog', { name: 'CS 18000 · Intro to Java' })).toBeTruthy();
  });

  it('"Show next week" adds the following week\'s work above the finished work', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    const c = within(card('CS 18000'));
    fireEvent.click(c.getByRole('button', { name: 'Show next week (1)' }));
    expect(c.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent)).toEqual(['Project 3', 'Lab 09', 'Quiz 6', 'Lab 10', 'Old lab']);
    expect(c.queryByRole('button', { name: /Show next week/ })).toBeNull();
  });

  it('with finished work in its own section, cards leave it out and "Done this week" lists it', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} completed="section" />);
    expect(within(card('CS 18000')).queryByText('Old lab')).toBeNull();
    const done = within(screen.getByRole('region', { name: 'Done this week' }));
    expect(done.getByText('2')).toBeTruthy();
    expect(done.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent)).toEqual(['Old lab', 'WebAssign 14.3']);
  });

  it('"Done this week" is hidden when nothing was finished, and unticking there marks the work not done', async () => {
    fakeBrowser.reset();
    const none = dash({ courses: [cs], items: [item('n1', 'b:1', 'Lab 09', '2026-11-07T23:59:00-05:00')] });
    const { unmount } = renderIn('en', <CoursesView dashboard={none} now={NOW} completed="section" />);
    expect(screen.queryByRole('region', { name: 'Done this week' })).toBeNull();
    unmount();
    await toggleDone(['i5'], true);
    renderIn('en', <CoursesView dashboard={d} now={NOW} completed="section" />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Done this week' })).getByRole('checkbox', { name: 'Mark done: Old lab' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({}));
  });

  it('a submitted item stays on the card, checked and locked', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    const box = within(card('MA 26100')).getByRole('checkbox', { name: 'Mark done: WebAssign 14.3' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });

  it('partial course card shows Some data did not sync', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    expect(within(card('COM 11400')).getByText('Some data did not sync')).toBeTruthy();
  });

  it('links open in new tab with rel=noopener', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    for (const a of within(card('CS 18000')).getAllByRole('link') as HTMLAnchorElement[]) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noopener');
    }
  });

  it('clicking card opens detail dialog with work grouped as overdue, upcoming and completed, and links by category', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    const dlg = within(screen.getByRole('dialog', { name: 'CS 18000 · Intro to Java' }));
    const group = (name: string) =>
      within(dlg.getByRole('region', { name })).getAllByTestId('detail-item').map((el) => el.querySelector('[data-title]')?.textContent);
    expect(group('Overdue')).toEqual(['Late lab']);
    expect(group('Upcoming')).toEqual(['Project 3', 'Lab 09', 'Quiz 6', 'Lab 10']);
    expect(group('Completed')).toEqual(['Old lab']);
    expect(dlg.queryByRole('region', { name: 'No due date' })).toBeNull();
    expect(dlg.getByText('Done')).toBeTruthy();
    expect(dlg.getByRole('heading', { name: 'Textbooks' })).toBeTruthy();
    expect(dlg.getByRole('heading', { name: 'Discussion' })).toBeTruthy();
    expect(dlg.getByRole('link', { name: 'zyBooks' })).toBeTruthy();
  });

  it('Esc and the close button close the dialog', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('empty dashboard shows a hint', () => {
    renderIn('en', <CoursesView dashboard={dash({})} now={NOW} />);
    expect(screen.getByText('No courses yet. They will appear here after the first sync.')).toBeTruthy();
  });

  it('detail has Add assignment and Add link buttons that open forms for this course', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    const dlg = within(screen.getByRole('dialog'));
    fireEvent.click(dlg.getByRole('button', { name: 'Add assignment' }));
    expect(dlg.getByRole('form', { name: 'Add assignment' })).toBeTruthy();
    expect(dlg.queryByLabelText('Course')).toBeNull();
    fireEvent.click(dlg.getByRole('button', { name: 'Add link' }));
    expect(dlg.getByRole('form', { name: 'Add link' })).toBeTruthy();
  });

  it('manual links in the detail can be deleted', async () => {
    fakeBrowser.reset();
    const l = { courseId: 'b:1', label: 'Piazza', url: 'https://piazza.com/x', category: 'discussion' as const, source: 'manual' as const };
    await addManualLink(l);
    renderIn('en', <CoursesView dashboard={{ ...d, links: [...d.links, l] }} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete link Piazza' }));
    await waitFor(async () => expect((await loadStore()).manualLinks).toEqual([]));
  });

  it('a course whose name is only term/code/section shows just the code as its title', () => {
    const chm = course('b:9', 'CHM 11510', { name: 'Fall 2026 CHM 11510 - Merge' });
    renderIn('en', <CoursesView dashboard={dash({ courses: [chm] })} now={NOW} />);
    const c = within(card('CHM 11510'));
    expect(c.queryByText('Fall 2026 CHM 11510 - Merge')).toBeNull();
    expect(c.getByRole('button', { name: 'Open CHM 11510 details' }).textContent).toBe('CHM 11510');
    fireEvent.click(c.getByRole('button', { name: 'Open CHM 11510 details' }));
    expect(screen.getByRole('dialog', { name: 'CHM 11510' })).toBeTruthy();
  });

  it('course-content website links stay off the card but appear in the detail; manual ones stay on the card', () => {
    const links = [
      link('b:1', 'Brightspace', 'lms'),
      link('b:1', 'Lecture 1 JOVE Playlist', 'website'),
      link('b:1', 'Lecture 2 JOVE Playlist', 'website'),
      { courseId: 'b:1', label: 'Course site', url: 'https://cs.purdue.edu/cs180', category: 'website' as const, source: 'manual' as const },
    ];
    renderIn('en', <CoursesView dashboard={{ ...d, links }} now={NOW} />);
    const pills = within(within(card('CS 18000')).getByRole('group', { name: 'Shortcuts' })).getAllByRole('link').map((a) => a.textContent);
    expect(pills).toEqual(['Brightspace', 'Course site']);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Lecture 2 JOVE Playlist' })).toBeTruthy();
  });
});

describe('CoursesView: scores on badges', () => {
  const sd = dash({
    courses: [cs],
    items: [
      item('s1', 'b:1', 'Scored lab', '2026-11-02T23:59:00-05:00', { doneByUser: true, score: { text: '18/25', from: 'WileyPLUS' } }),
      item('s2', 'b:1', 'Scored quiz', '2026-11-05T23:59:00-05:00', { submitted: true, score: { text: '92%', from: 'Gradescope' } }),
      item('s3', 'b:1', 'Plain lab', '2026-11-03T23:59:00-05:00', { doneByUser: true }),
    ],
    links: [],
  });

  it('shows the score after Done with its source as the title', () => {
    renderIn('en', <CoursesView dashboard={sd} now={NOW} />);
    const b = screen.getByText('Done · 18/25');
    expect(b.getAttribute('title')).toBe('Score from WileyPLUS');
  });

  it('shows the score after Submitted', () => {
    renderIn('en', <CoursesView dashboard={sd} now={NOW} />);
    expect(screen.getByText('Submitted · 92%')).toBeTruthy();
  });

  it('a done item without a score shows plain Done and no title', () => {
    renderIn('en', <CoursesView dashboard={sd} now={NOW} />);
    const b = screen.getByText('Done');
    expect(b.hasAttribute('title')).toBe(false);
  });
});
