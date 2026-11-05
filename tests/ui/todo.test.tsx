import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { renderIn } from './render';
import { TodoView } from '../../src/ui/views/TodoView';
import { ManualItemForm } from '../../src/ui/components/ManualItemForm';
import { ManualLinkForm } from '../../src/ui/components/ManualLinkForm';
import { loadStore, addManualItem } from '../../src/storage/store';
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

  it('lists items sorted, grouped 已逾期 / 今天 / 明天 / 本周 / 以后 / 无截止日期', () => {
    renderIn('zh', <TodoView dashboard={d} now={NOW} />);
    expect(titles(group('已逾期'))).toEqual(['Late lab']);
    expect(titles(group('今天'))).toEqual(['Project 3']);
    expect(titles(group('明天'))).toEqual(['WebAssign 14.3']);
    expect(titles(group('本周'))).toEqual(['Quiz 6']);
    expect(titles(group('以后'))).toEqual(['Exam 2']);
    expect(titles(group('无截止日期'))).toEqual(['Reading']);
    expect(within(group('今天')).getByText('CS 18000')).toBeTruthy();
  });

  it('checkbox toggles done via toggleDone(item.sourceKeys)', async () => {
    renderIn('zh', <TodoView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Project 3' }));
    await waitFor(async () => expect((await loadStore()).userState.done).toEqual({ 'brightspace:t': true, 'gradescope:9': true }));
  });

  it('completed section collapsed by default, holds done and submitted items', () => {
    renderIn('zh', <TodoView dashboard={d} now={NOW} />);
    const details = screen.getByText('已完成（2）').closest('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getAllByTestId('todo-title').map((x) => x.textContent)).toEqual(['Lab 08', 'Office hours prep']);
  });

  it('submitted items show 已提交 and are checked and locked', () => {
    renderIn('zh', <TodoView dashboard={d} now={NOW} />);
    const box = screen.getByRole('checkbox', { name: 'Lab 08' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(screen.getByText('已提交')).toBeTruthy();
  });

  it('manual items can be deleted', async () => {
    const id = await addManualItem({ courseId: 'brightspace:2', title: 'X', dueAt: null, url: '' });
    const withManual = dash({ ...d, items: [item(id, 'brightspace:2', 'X', null, { type: 'manual', sources: ['manual'], sourceKeys: [id] })] });
    renderIn('zh', <TodoView dashboard={withManual} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '删除 X' }));
    await waitFor(async () => expect((await loadStore()).manualItems).toEqual([]));
  });

  it('empty state', () => {
    renderIn('zh', <TodoView dashboard={dash({})} now={NOW} />);
    expect(screen.getByText('没有待办，好好休息一下。')).toBeTruthy();
  });

  it('添加作业 button opens the manual item form', () => {
    renderIn('zh', <TodoView dashboard={d} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: '添加作业' }));
    expect(screen.getByRole('form', { name: '添加作业' })).toBeTruthy();
  });
});

describe('ManualItemForm', () => {
  beforeEach(() => fakeBrowser.reset());

  it('manual item form requires course and title, due optional; saved item appears', async () => {
    let closed = false;
    renderIn('zh', <ManualItemForm courses={[cs, ma]} onDone={() => (closed = true)} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert').textContent).toBe('请选择课程并填写标题');
    fireEvent.change(screen.getByLabelText('课程'), { target: { value: 'brightspace:2' } });
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'WebAssign 14.3' } });
    fireEvent.change(screen.getByLabelText('截止时间（可选）'), { target: { value: '2026-11-07T23:59' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await loadStore()).manualItems).toHaveLength(1));
    const saved = (await loadStore()).manualItems[0]!;
    expect(saved).toMatchObject({ courseId: 'brightspace:2', title: 'WebAssign 14.3', dueAt: new Date('2026-11-08T04:59:00.000Z').toISOString() });
    expect(saved.url).toBe(ma.url);
    expect(closed).toBe(true);
  });

  it('fixed course hides the course picker', () => {
    renderIn('zh', <ManualItemForm courses={[cs, ma]} courseId="brightspace:1" onDone={() => {}} />);
    expect(screen.queryByLabelText('课程')).toBeNull();
  });
});

describe('ManualLinkForm', () => {
  beforeEach(() => fakeBrowser.reset());

  it('manual link form rejects non-http url', async () => {
    renderIn('zh', <ManualLinkForm courseId="brightspace:1" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Piazza' } });
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert').textContent).toBe('请输入以 http:// 或 https:// 开头的网址');
    expect((await loadStore()).manualLinks).toEqual([]);
  });

  it('saves a link with chosen category', async () => {
    renderIn('zh', <ManualLinkForm courseId="brightspace:1" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Piazza' } });
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'https://piazza.com/class/x' } });
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'discussion' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () =>
      expect((await loadStore()).manualLinks).toEqual([
        { courseId: 'brightspace:1', label: 'Piazza', url: 'https://piazza.com/class/x', category: 'discussion', source: 'manual' },
      ]),
    );
  });
});
