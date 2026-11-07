import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TodoView } from '../../src/ui/views/TodoView';
import { CalendarView } from '../../src/ui/views/CalendarView';
import { NextDueBanner } from '../../src/ui/components/NextDueBanner';
import { buildDashboard } from '../../src/core/dashboard';
import { syllabusSuggestions } from '../../src/core/syllabusSuggestions';
import { loadStore, migrate, patchStore } from '../../src/storage/store';
import type { StoreShape } from '../../src/core/types';

const now = new Date(2026, 9, 1, 12);
const B = 'https://purdue.brightspace.com';
const examAt = new Date(2026, 9, 14, 0, 0).toISOString();
const seed = (): StoreShape =>
  migrate({
    snapshots: { brightspace: { syncedAt: 'x', partial: [], links: [], items: [], courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA 16100', code: 'MA 16100', url: `${B}/d2l/home/1` }] } },
    syllabus: { '1': { source: `${B}/s.pdf`, kind: 'pdf', readAt: now.toISOString(), modified: null, rows: [{ title: 'Exam 2', dueAt: examAt, allDay: true, excerpt: 'Oct 14 | Exam 2' }] } },
  });

describe('syllabus suggestions in the to-do list', () => {
  beforeEach(() => fakeBrowser.reset());

  it('shows them under "From syllabus" and adds one as your own item', async () => {
    const s = seed();
    await patchStore(s);
    const dash = buildDashboard(s, now);
    render(<TodoView dashboard={dash} now={now} syllabus={{ suggestions: syllabusSuggestions(s, dash, now), unreadable: [] }} />);
    expect(screen.getByRole('heading', { name: 'From syllabus' })).toBeTruthy();
    expect(screen.getByText('Exam 2')).toBeTruthy();
    expect(screen.getByText("From Syllabus PDF: 'Oct 14 | Exam 2'")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Exam 2' }));
    await waitFor(async () => expect((await loadStore()).manualItems).toEqual([expect.objectContaining({ courseId: 'brightspace:1', title: 'Exam 2', dueAt: examAt, url: `${B}/d2l/home/1` })]));
  });

  it('hides one for good', async () => {
    const s = seed();
    await patchStore(s);
    const dash = buildDashboard(s, now);
    const [sg] = syllabusSuggestions(s, dash, now);
    render(<TodoView dashboard={dash} now={now} syllabus={{ suggestions: [sg!], unreadable: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Exam 2' }));
    await waitFor(async () => expect((await loadStore()).userState.syllabusHidden).toEqual({ [sg!.key]: true }));
  });

  it('never puts suggestions in the next-deadline banner or the calendar', () => {
    const s = seed();
    const dash = buildDashboard(s, now);
    expect(dash.nextDue).toBeNull();
    const { container } = render(<NextDueBanner item={dash.nextDue} course={undefined} now={now} />);
    expect(container.textContent).toBe('');
    render(<CalendarView dashboard={dash} now={now} />);
    expect(screen.queryByText('Exam 2')).toBeNull();
  });
});

describe('syllabus suggestions in course details', () => {
  beforeEach(() => fakeBrowser.reset());
  it('lists the course\'s suggestions, and says when its syllabus could not be read', async () => {
    const { CoursesView } = await import('../../src/ui/views/CoursesView');
    const s = seed();
    const dash = buildDashboard(s, now);
    const sugg = syllabusSuggestions(s, dash, now);
    const { unmount } = render(<CoursesView dashboard={dash} now={now} syllabus={{ suggestions: sugg, unreadable: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: /Open MA 16100 details/ }));
    expect(screen.getByRole('heading', { name: 'From syllabus' })).toBeTruthy();
    expect(screen.getByText('Exam 2')).toBeTruthy();
    unmount();
    render(<CoursesView dashboard={dash} now={now} syllabus={{ suggestions: [], unreadable: ['brightspace:1'] }} />);
    fireEvent.click(screen.getByRole('button', { name: /Open MA 16100 details/ }));
    expect(screen.getByText("Syllabus couldn't be read")).toBeTruthy();
  });
});
