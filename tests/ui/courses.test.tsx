import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderIn } from './render';
import { CoursesView } from '../../src/ui/views/CoursesView';
import { NOW, course, item, link, dash } from './fixtures';

const cs = course('b:1', 'CS 18000', { color: '#EA580C', name: 'Java 编程入门' });
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
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    const c = within(card('CS 18000'));
    expect(c.getByText('Java 编程入门')).toBeTruthy();
    expect((c.getByTestId('course-dot') as HTMLElement).style.background.toLowerCase()).toMatch(/#ea580c|rgb\(234, 88, 12\)/);
    expect(c.getAllByRole('listitem').map((li) => li.querySelector('[data-title]')?.textContent)).toEqual(['Project 3', 'Lab 09', 'Quiz 6']);
    expect(c.getByText('Gradescope · 今天 18:00')).toBeTruthy();
    expect(c.getByText('6 小时后')).toBeTruthy();
    expect(c.getByRole('button', { name: '还有 1 项' })).toBeTruthy();
    expect(within(c.getByRole('group', { name: '快捷入口' })).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Brightspace',
      'Gradescope',
      'zyBooks',
      'Ed',
    ]);
  });

  it('card with no pending items shows 近期没有待交作业', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    expect(within(card('MA 26100')).getByText('近期没有待交作业')).toBeTruthy();
  });

  it('partial course card shows 部分数据未同步', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    expect(within(card('COM 11400')).getByText('部分数据未同步')).toBeTruthy();
  });

  it('links open in new tab with rel=noopener', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    for (const a of within(card('CS 18000')).getAllByRole('link') as HTMLAnchorElement[]) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noopener');
    }
  });

  it('clicking card opens detail dialog listing all items and links grouped by category', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '查看 CS 18000 详情' }));
    const dlg = within(screen.getByRole('dialog', { name: 'CS 18000 · Java 编程入门' }));
    expect(dlg.getAllByTestId('detail-item').map((el) => el.querySelector('[data-title]')?.textContent)).toEqual([
      'Old lab',
      'Project 3',
      'Lab 09',
      'Quiz 6',
      'Lab 10',
    ]);
    expect(dlg.getByText('已完成')).toBeTruthy();
    expect(dlg.getByRole('heading', { name: '教材' })).toBeTruthy();
    expect(dlg.getByRole('heading', { name: '讨论区' })).toBeTruthy();
    expect(dlg.getByRole('link', { name: 'zyBooks' })).toBeTruthy();
  });

  it('"还有 N 项" also opens the detail', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '还有 1 项' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Esc and the close button close the dialog', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '查看 CS 18000 详情' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '查看 CS 18000 详情' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('empty dashboard shows a hint', () => {
    renderIn('zh', <CoursesView dashboard={dash({})} now={NOW} />);
    expect(screen.getByText('还没有课程。同步完成后，你的课程会出现在这里。')).toBeTruthy();
  });
});
