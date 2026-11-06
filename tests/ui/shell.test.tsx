import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { renderIn } from './render';
import { Header } from '../../src/ui/components/Header';
import { NextDueBanner } from '../../src/ui/components/NextDueBanner';
import { StatChips } from '../../src/ui/components/StatChips';
import { ViewTabs } from '../../src/ui/components/ViewTabs';
import { SourceBanners } from '../../src/ui/components/SourceBanners';
import { DueBadge } from '../../src/ui/components/DueBadge';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary';
import { migrate } from '../../src/storage/store';
import type { Course, Item } from '../../src/core/types';

const now = new Date('2026-11-04T12:00:00-05:00');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe('Header', () => {
  it('shows date, greeting with pending count, sync status', () => {
    renderIn('zh', <Header now={now} pendingWeek={9} lastSynced={minsAgo(5)} syncing={false} onRefresh={() => {}} />);
    expect(screen.getByText('11月4日 星期三')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('下午好，本周还有 9 项待交');
    expect(screen.getByText('已同步 · 5 分钟前')).toBeTruthy();
  });
  it('english greeting and morning/evening boundaries', () => {
    renderIn('en', <Header now={new Date('2026-11-04T08:00:00-05:00')} pendingWeek={9} lastSynced={null} syncing={false} onRefresh={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, 9 due this week');
    expect(screen.getByText('Not synced yet')).toBeTruthy();
  });
  it('evening and nothing due', () => {
    renderIn('zh', <Header now={new Date('2026-11-04T19:00:00-05:00')} pendingWeek={0} lastSynced={null} syncing={false} onRefresh={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('晚上好，本周没有待交作业');
  });
  it('refresh button calls onRefresh and is disabled while syncing', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderIn('zh', <Header now={now} pendingWeek={1} lastSynced={null} syncing={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    rerender(<Header now={now} pendingWeek={1} lastSynced={null} syncing onRefresh={onRefresh} />);
    expect((screen.getByRole('button', { name: '同步中…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const course: Course = { id: 'brightspace:1', code: 'CS 18000', name: 'CS 18000', sources: {}, color: '#EA580C', hidden: false, url: '', partial: false, isCourse: true };
const nextItem: Item = {
  id: 'gradescope:3', courseId: 'brightspace:1', title: 'Project 3', type: 'assignment', dueAt: '2026-11-04T22:42:18.000Z',
  url: 'https://www.gradescope.com/courses/9/assignments/3', sources: ['gradescope'], sourceKeys: ['gradescope:3'], submitted: false, doneByUser: false,
};

describe('NextDueBanner', () => {
  it('hidden when nextDue null', () => {
    const { container } = renderIn('zh', <NextDueBanner item={null} course={undefined} now={now} />);
    expect(container.textContent).toBe('');
  });
  it('shows course code · title, source and due, countdown, 去提交 link to item.url', () => {
    renderIn('zh', <NextDueBanner item={nextItem} course={course} now={now} />);
    expect(screen.getByText('下一个截止')).toBeTruthy();
    expect(screen.getByText('CS 18000 · Project 3')).toBeTruthy();
    expect(screen.getByText('Gradescope · 今天 17:42')).toBeTruthy();
    expect(screen.getByText('05:42:18')).toBeTruthy();
    const link = screen.getByRole('link', { name: '去提交' }) as HTMLAnchorElement;
    expect(link.href).toBe(nextItem.url);
    expect(link.target).toBe('_blank');
  });
});

describe('StatChips', () => {
  it('shows 48h count and week count', () => {
    renderIn('zh', <StatChips within48={3} week={9} />);
    expect(screen.getByText('48 小时内 3 项')).toBeTruthy();
    expect(screen.getByText('本周 9 项')).toBeTruthy();
  });
});

describe('ViewTabs', () => {
  it('marks the current view and reports changes', () => {
    const onChange = vi.fn();
    renderIn('zh', <ViewTabs view="courses" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: '课程' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '日历' }));
    expect(onChange).toHaveBeenCalledWith('calendar');
  });
});

describe('SourceBanners', () => {
  it('shows relogin button when lastError.reason is not_logged_in', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const store = migrate({ syncMeta: { gradescope: { lastSuccess: minsAgo(120), lastError: { at: minsAgo(1), reason: 'not_logged_in' } } } });
    renderIn('zh', <SourceBanners store={store} now={now} />);
    expect(screen.getByText('Gradescope 需要重新登录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '去登录' }));
    expect(open).toHaveBeenCalledWith('https://www.gradescope.com/login', '_blank', 'noopener');
  });
  it('shows stale notice with age for other errors', () => {
    const store = migrate({
      snapshots: { brightspace: { syncedAt: minsAgo(120), courses: [], items: [], links: [], partial: [] } },
      syncMeta: { brightspace: { lastSuccess: minsAgo(120), lastError: { at: minsAgo(1), reason: 'network' } } },
    });
    renderIn('zh', <SourceBanners store={store} now={now} />);
    expect(screen.getByText('Brightspace 同步失败 · 显示的是 2 小时前的数据')).toBeTruthy();
  });
  it('nothing when the last attempt succeeded', () => {
    const store = migrate({ syncMeta: { brightspace: { lastSuccess: minsAgo(1), lastError: { at: minsAgo(30), reason: 'network' } } } });
    const { container } = renderIn('zh', <SourceBanners store={store} now={now} />);
    expect(container.textContent).toBe('');
  });
});

describe('DueBadge', () => {
  it.each([
    [{ dueAt: '2026-11-04T23:00:00.000Z', done: false }, '6 小时后', 'urgent'],
    [{ dueAt: '2026-11-09T17:00:00.000Z', done: false }, '5 天后', 'soon'],
    [{ dueAt: '2026-11-20T17:00:00.000Z', done: false }, '16 天后', 'normal'],
    [{ dueAt: '2026-11-03T17:00:00.000Z', done: false }, '已逾期', 'overdue'],
    [{ dueAt: '2026-11-04T23:00:00.000Z', done: true }, '已完成', 'done'],
    [{ dueAt: '2026-11-04T23:00:00.000Z', done: false, submitted: true }, '已提交', 'done'],
    [{ dueAt: null, done: false }, '无截止日期', 'normal'],
  ])('%o → %s', (props, label, tone) => {
    renderIn('zh', <DueBadge now={now} {...props} />);
    const el = screen.getByText(label);
    expect(el.getAttribute('data-tone')).toBe(tone);
  });
});

describe('ErrorBoundary', () => {
  it('renders fallback text', () => {
    const Boom = () => {
      throw new Error('x');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary fallback="页面出错了"><Boom /></ErrorBoundary>);
    expect(screen.getByText('页面出错了')).toBeTruthy();
  });
});
