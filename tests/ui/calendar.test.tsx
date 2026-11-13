import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderIn } from './render';
import { CalendarView } from '../../src/ui/views/CalendarView';
import { TodoView } from '../../src/ui/views/TodoView';
import { CoursesView } from '../../src/ui/views/CoursesView';
import { NOW, course, item, dash } from './fixtures';

const cs = course('b:1', 'CS 18000', { color: '#EA580C' });
const ma = course('b:2', 'MA 26100', { color: '#2563EB' });
const d = dash({
  courses: [cs, ma],
  items: [
    item('i1', 'b:1', 'Project 3', '2026-11-04T23:59:00-05:00'),
    item('i2', 'b:2', 'Quiz 6', '2026-11-04T09:00:00-05:00', { submitted: true }),
    item('i3', 'b:2', 'HW 1', '2026-11-20T23:59:00-05:00'),
    item('i4', 'b:2', 'HW 2', '2026-11-20T23:59:00-05:00'),
    item('i5', 'b:2', 'HW 3', '2026-11-20T23:59:00-05:00'),
    item('i6', 'b:2', 'HW 4', '2026-11-20T23:59:00-05:00'),
    item('i7', 'b:2', 'HW 5', '2026-11-20T23:59:00-05:00'),
    item('i8', 'b:2', 'Reading', null),
  ],
});

describe('CalendarView', () => {
  it('starts in week view showing this week with today marked', () => {
    renderIn('en', <CalendarView dashboard={d} now={NOW} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Nov 1 – Nov 7');
    const today = screen.getByRole('gridcell', { current: 'date' });
    expect(within(today).getByText('Project 3')).toBeTruthy();
    expect(within(today).getByText('Quiz 6')).toBeTruthy();
  });

  it('item card uses course color and shows the class under the task', () => {
    renderIn('en', <CalendarView dashboard={d} now={NOW} />);
    const chip = screen.getByRole('link', { name: /Project 3/ }) as HTMLAnchorElement;
    expect(chip.href).toBe('https://x/i1');
    expect(chip.target).toBe('_blank');
    expect(chip.textContent).toContain('11:59 PM');
    expect(within(chip).getByTestId('chip-course').textContent).toBe('CS 18000');
    expect(chip.className).toContain('flex-col');
    const dot = chip.querySelector('[data-testid="chip-dot"]') as HTMLElement;
    expect(dot.style.background.toLowerCase()).toMatch(/#ea580c|rgb\(234, 88, 12\)/);
  });

  it('submitted or done items are marked', () => {
    renderIn('en', <CalendarView dashboard={d} now={NOW} />);
    expect(screen.getByRole('link', { name: /Quiz 6/ }).getAttribute('data-done')).toBe('true');
  });

  it('week/month toggle and prev/next/today buttons', () => {
    renderIn('en', <CalendarView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Nov 8 – Nov 14');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Nov 1 – Nov 7');
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('November 2026');
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('October 2026');
  });

  it('day with more than 3 items shows +N in month view', () => {
    renderIn('en', <CalendarView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    const cell = screen.getByRole('gridcell', { name: 'Nov 20' });
    expect(within(cell).getAllByRole('link')).toHaveLength(3);
    expect(within(cell).getByText('+2 more')).toBeTruthy();
  });

  it('english labels', () => {
    renderIn('en', <CalendarView dashboard={d} now={NOW} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Nov 1 – Nov 7');
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('November 2026');
  });
});

describe('CalendarView 1.5.0: past work', () => {
  it('shows a done item 5 weeks ago muted and an overdue one urgent', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { CalendarView } = await import('../../src/ui/views/CalendarView');
    const { NOW: now, course: mkCourse, item: mkItem, dash: mkDash } = await import('./fixtures');
    const when = new Date(now.getTime() - 35 * 86_400_000);
    const d = mkDash({
      courses: [mkCourse('brightspace:1', 'CS 18000')],
      items: [
        mkItem('brightspace:a', 'brightspace:1', 'Done long ago', when.toISOString(), { submitted: true }),
        mkItem('brightspace:b', 'brightspace:1', 'Missed long ago', when.toISOString()),
      ],
    });
    render(<CalendarView dashboard={d} now={now} />);
    for (let i = 0; i < 5; i++) screen.getByRole('button', { name: 'Previous week' }).click();
    const chip = (t: string) => screen.getByText(t).closest('a')!;
    await screen.findByText('Done long ago');
    expect(chip('Done long ago').getAttribute('data-done')).toBe('true');
    expect(chip('Missed long ago').getAttribute('data-overdue')).toBe('true');
    expect(chip('Done long ago').getAttribute('data-overdue')).toBe('false');
  });
});

describe('CalendarView: class meetings (issue #29)', () => {
  const lec = { id: 'brightspace:event:9', courseId: 'b:1', title: 'Lec21', startAt: '2026-11-05T09:30:00-05:00', endAt: '2026-11-05T10:20:00-05:00', url: 'https://purdue.brightspace.com/d2l/le/calendar/1' };
  const withLec = dash({ ...d, meetings: [lec] });

  it('the week view shows a meeting under the day\'s work, with its time range, linking to its page', () => {
    renderIn('en', <CalendarView dashboard={withLec} now={NOW} />);
    const thu = screen.getByRole('gridcell', { name: 'Nov 5' });
    const chip = within(thu).getByText('CS 18000 · Lec21').closest('a')!;
    expect(chip.getAttribute('href')).toBe(lec.url);
    expect(chip.getAttribute('data-kind')).toBe('meeting');
    expect(chip.textContent).toContain('9:30–10:20 AM');
  });

  it('the month view shows no meetings', () => {
    renderIn('en', <CalendarView dashboard={withLec} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.queryByText(/Lec21/)).toBeNull();
  });

  it('To-do and the course cards never show meetings', () => {
    renderIn('en', <TodoView dashboard={withLec} now={NOW} />);
    expect(screen.queryByText(/Lec21/)).toBeNull();
    renderIn('en', <CoursesView dashboard={withLec} now={NOW} />);
    expect(screen.queryByText(/Lec21/)).toBeNull();
  });
});
