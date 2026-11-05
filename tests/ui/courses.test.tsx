import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addManualLink, loadStore } from '../../src/storage/store';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
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

  it('detail has 添加作业 and 添加链接 buttons that open forms for this course', () => {
    renderIn('zh', <CoursesView dashboard={d} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '查看 CS 18000 详情' }));
    const dlg = within(screen.getByRole('dialog'));
    fireEvent.click(dlg.getByRole('button', { name: '添加作业' }));
    expect(dlg.getByRole('form', { name: '添加作业' })).toBeTruthy();
    expect(dlg.queryByLabelText('课程')).toBeNull();
    fireEvent.click(dlg.getByRole('button', { name: '添加链接' }));
    expect(dlg.getByRole('form', { name: '添加链接' })).toBeTruthy();
  });

  it('manual links in the detail can be deleted', async () => {
    fakeBrowser.reset();
    const l = { courseId: 'b:1', label: 'Piazza', url: 'https://piazza.com/x', category: 'discussion' as const, source: 'manual' as const };
    await addManualLink(l);
    renderIn('zh', <CoursesView dashboard={{ ...d, links: [...d.links, l] }} now={NOW} />);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '查看 CS 18000 详情' }));
    fireEvent.click(screen.getByRole('button', { name: '删除链接 Piazza' }));
    await waitFor(async () => expect((await loadStore()).manualLinks).toEqual([]));
  });

  it('a course whose name is only term/code/section shows just the code as its title', () => {
    const chm = course('b:9', 'CHM 11510', { name: 'Fall 2026 CHM 11510 - Merge' });
    renderIn('zh', <CoursesView dashboard={dash({ courses: [chm] })} now={NOW} />);
    const c = within(card('CHM 11510'));
    expect(c.queryByText('Fall 2026 CHM 11510 - Merge')).toBeNull();
    expect(c.getByRole('button', { name: '查看 CHM 11510 详情' }).textContent).toBe('CHM 11510');
    fireEvent.click(c.getByRole('button', { name: '查看 CHM 11510 详情' }));
    expect(screen.getByRole('dialog', { name: 'CHM 11510' })).toBeTruthy();
  });

  it('course-content website links stay off the card but appear in the detail; manual ones stay on the card', () => {
    const links = [
      link('b:1', 'Brightspace', 'lms'),
      link('b:1', 'Lecture 1 JOVE Playlist', 'website'),
      link('b:1', 'Lecture 2 JOVE Playlist', 'website'),
      { courseId: 'b:1', label: 'Course site', url: 'https://cs.purdue.edu/cs180', category: 'website' as const, source: 'manual' as const },
    ];
    renderIn('zh', <CoursesView dashboard={{ ...d, links }} now={NOW} />);
    const pills = within(within(card('CS 18000')).getByRole('group', { name: '快捷入口' })).getAllByRole('link').map((a) => a.textContent);
    expect(pills).toEqual(['Brightspace', 'Course site']);
    fireEvent.click(within(card('CS 18000')).getByRole('button', { name: '查看 CS 18000 详情' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Lecture 2 JOVE Playlist' })).toBeTruthy();
  });
});
