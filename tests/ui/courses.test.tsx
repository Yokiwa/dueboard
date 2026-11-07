import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addManualLink, loadStore } from '../../src/storage/store';
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
  it('card shows code, name, color dot, at most 3 upcoming not-done items, and all links as buttons', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    const c = within(card('CS 18000'));
    expect(c.getByText('Intro to Java')).toBeTruthy();
    expect((c.getByTestId('course-dot') as HTMLElement).style.background.toLowerCase()).toMatch(/#ea580c|rgb\(234, 88, 12\)/);
    expect(c.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent)).toEqual(['Project 3', 'Lab 09', 'Quiz 6']);
    expect(c.getByText('Gradescope · Today 6:00 PM')).toBeTruthy();
    expect(c.getByText('in 6 h')).toBeTruthy();
    expect(c.getByRole('button', { name: '1 more' })).toBeTruthy();
    expect(within(c.getByRole('group', { name: 'Shortcuts' })).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Brightspace',
      'Gradescope',
      'zyBooks',
      'Ed',
    ]);
  });

  it('card with nothing upcoming shows Nothing due soon', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    expect(within(card('COM 11400')).getByText('Nothing due soon')).toBeTruthy();
  });

  it('a submitted item that is not past due stays on the card, checked and locked', () => {
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

  it('clicking card opens detail dialog listing all items and links grouped by category', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: 'Open CS 18000 details' }));
    const dlg = within(screen.getByRole('dialog', { name: 'CS 18000 · Intro to Java' }));
    expect(dlg.getAllByTestId('detail-item').map((el) => el.querySelector('[data-title]')?.textContent)).toEqual([
      'Old lab',
      'Project 3',
      'Lab 09',
      'Quiz 6',
      'Lab 10',
    ]);
    expect(dlg.getByText('Done')).toBeTruthy();
    expect(dlg.getByRole('heading', { name: 'Textbooks' })).toBeTruthy();
    expect(dlg.getByRole('heading', { name: 'Discussion' })).toBeTruthy();
    expect(dlg.getByRole('link', { name: 'zyBooks' })).toBeTruthy();
  });

  it('"N more" also opens the detail', () => {
    renderIn('en', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '1 more' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
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
