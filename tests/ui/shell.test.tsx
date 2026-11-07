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
/** Snapshots that make a platform relevant: Brightspace content links to it. */
const linkedTo = (title: string, url: string) => ({
  brightspace: { syncedAt: 'x', partial: [], items: [], courses: [], links: [{ source: 'brightspace' as const, sourceCourseId: '1', title, url }] },
});
const PEARSON_LINK = '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=98&type=lti&rcode=X';

describe('Header', () => {
  it('shows date, greeting with pending count, sync status', () => {
    renderIn('en', <Header now={now} pendingWeek={9} lastSynced={minsAgo(5)} syncing={false} onRefresh={() => {}} />);
    expect(screen.getByText('Wednesday, November 4')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good afternoon, 9 due this week');
    expect(screen.getByText('Synced · 5 min ago')).toBeTruthy();
  });
  it('english greeting and morning/evening boundaries', () => {
    renderIn('en', <Header now={new Date('2026-11-04T08:00:00-05:00')} pendingWeek={9} lastSynced={null} syncing={false} onRefresh={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, 9 due this week');
    expect(screen.getByText('Not synced yet')).toBeTruthy();
  });
  it('evening and nothing due', () => {
    renderIn('en', <Header now={new Date('2026-11-04T19:00:00-05:00')} pendingWeek={0} lastSynced={null} syncing={false} onRefresh={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, nothing due this week');
  });
  it('refresh button calls onRefresh and is disabled while syncing', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderIn('en', <Header now={now} pendingWeek={1} lastSynced={null} syncing={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    rerender(<Header now={now} pendingWeek={1} lastSynced={null} syncing onRefresh={onRefresh} />);
    expect((screen.getByRole('button', { name: 'Syncing…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const course: Course = { id: 'brightspace:1', code: 'CS 18000', name: 'CS 18000', sources: {}, color: '#EA580C', hidden: false, url: '', partial: false, isCourse: true };
const nextItem: Item = {
  id: 'gradescope:3', courseId: 'brightspace:1', title: 'Project 3', type: 'assignment', dueAt: '2026-11-04T22:42:18.000Z',
  url: 'https://www.gradescope.com/courses/9/assignments/3', sources: ['gradescope'], sourceKeys: ['gradescope:3'], submitted: false, doneByUser: false,
};

describe('NextDueBanner', () => {
  it('hidden when nextDue null', () => {
    const { container } = renderIn('en', <NextDueBanner item={null} course={undefined} now={now} />);
    expect(container.textContent).toBe('');
  });
  it('shows course code · title, source and due, countdown, Open link to item.url', () => {
    renderIn('en', <NextDueBanner item={nextItem} course={course} now={now} />);
    expect(screen.getByText('NEXT DEADLINE')).toBeTruthy();
    expect(screen.getByText('CS 18000 · Project 3')).toBeTruthy();
    expect(screen.getByText('Gradescope · Today 5:42 PM')).toBeTruthy();
    expect(screen.getByText('05:42:18')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open' }) as HTMLAnchorElement;
    expect(link.href).toBe(nextItem.url);
    expect(link.target).toBe('_blank');
  });
});

describe('StatChips', () => {
  it('shows 48h count and week count', () => {
    renderIn('en', <StatChips within48={3} week={9} />);
    expect(screen.getByText('3 due in 48 h')).toBeTruthy();
    expect(screen.getByText('9 this week')).toBeTruthy();
  });
});

describe('ViewTabs', () => {
  it('marks the current view and reports changes', () => {
    const onChange = vi.fn();
    renderIn('en', <ViewTabs view="courses" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Courses' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(onChange).toHaveBeenCalledWith('calendar');
  });
});

describe('SourceBanners', () => {
  it('shows relogin button when lastError.reason is not_logged_in', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const store = migrate({ snapshots: linkedTo('Gradescope', 'https://www.gradescope.com/courses/9'), syncMeta: { gradescope: { lastSuccess: minsAgo(120), lastError: { at: minsAgo(1), reason: 'not_logged_in' } } } });
    renderIn('en', <SourceBanners store={store} now={now} />);
    expect(screen.getByText('Gradescope needs you to sign in again')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(open).toHaveBeenCalledWith('https://www.gradescope.com/login', '_blank', 'noopener');
  });
  it('shows stale notice with age for other errors', () => {
    const store = migrate({
      snapshots: { brightspace: { syncedAt: minsAgo(120), courses: [], items: [], links: [], partial: [] } },
      syncMeta: { brightspace: { lastSuccess: minsAgo(120), lastError: { at: minsAgo(1), reason: 'network' } } },
    });
    renderIn('en', <SourceBanners store={store} now={now} />);
    expect(screen.getByText('Brightspace sync failed · showing data from 2 h ago')).toBeTruthy();
  });
  it('nothing when the last attempt succeeded', () => {
    const store = migrate({ syncMeta: { brightspace: { lastSuccess: minsAgo(1), lastError: { at: minsAgo(30), reason: 'network' } } } });
    const { container } = renderIn('en', <SourceBanners store={store} now={now} />);
    expect(container.textContent).toBe('');
  });
});

describe('DueBadge', () => {
  it.each([
    [{ dueAt: '2026-11-04T23:00:00.000Z', done: false }, 'in 6 h', 'urgent'],
    [{ dueAt: '2026-11-09T17:00:00.000Z', done: false }, 'in 5 days', 'soon'],
    [{ dueAt: '2026-11-20T17:00:00.000Z', done: false }, 'in 16 days', 'normal'],
    [{ dueAt: '2026-11-03T17:00:00.000Z', done: false }, 'Overdue', 'overdue'],
    [{ dueAt: '2026-11-04T23:00:00.000Z', done: true }, 'Done', 'done'],
    [{ dueAt: '2026-11-04T23:00:00.000Z', done: false, submitted: true }, 'Submitted', 'done'],
    [{ dueAt: null, done: false }, 'No due date', 'normal'],
  ])('%o → %s', (props, label, tone) => {
    renderIn('en', <DueBadge now={now} {...props} />);
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
    render(<ErrorBoundary fallback="Something broke"><Boom /></ErrorBoundary>);
    expect(screen.getByText('Something broke')).toBeTruthy();
  });
});

describe('SourceBanners for Pearson', () => {
  it('asks to reopen Pearson and the button uses the course launch link', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const store = migrate({ snapshots: linkedTo('Access Pearson', PEARSON_LINK), syncMeta: { pearson: { lastError: { at: minsAgo(1), reason: 'not_logged_in' } } } });
    renderIn('en', <SourceBanners store={store} now={now} launchUrls={{ pearson: 'https://purdue.brightspace.com/d2l/common/dialogs/quickLink/quickLink.d2l?ou=98&type=lti' }} />);
    expect(screen.getByText('Pearson session expired — open it once from Brightspace')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Pearson' }));
    expect(open).toHaveBeenCalledWith('https://purdue.brightspace.com/d2l/common/dialogs/quickLink/quickLink.d2l?ou=98&type=lti', '_blank', 'noopener');
  });
});

describe('SourceBanners error details', () => {
  it('a failed sync can be expanded to show what went wrong', () => {
    const store = migrate({ snapshots: linkedTo('Access Pearson', PEARSON_LINK), syncMeta: { pearson: { lastError: { at: minsAgo(2), reason: 'network', detail: 'TypeError: Failed to fetch' } } } });
    renderIn('en', <SourceBanners store={store} now={now} />);
    expect(screen.getByText('Pearson sync failed')).toBeTruthy();
    const details = screen.getByText('Details').closest('details')!;
    expect(details.textContent).toContain('network');
    expect(details.textContent).toContain('TypeError: Failed to fetch');
  });
});

describe('SourceBanners only for platforms this student uses', () => {
  it('a Gradescope sign-in problem stays quiet when no course links Gradescope and it has no data', () => {
    const store = migrate({ syncMeta: { gradescope: { lastError: { at: minsAgo(1), reason: 'not_logged_in' } } } });
    const { container } = renderIn('en', <SourceBanners store={store} now={now} />);
    expect(container.textContent).toBe('');
  });
  it('shows it once Brightspace links Gradescope, and signs in through that link', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const store = migrate({
      snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], courses: [], links: [{ source: 'brightspace', sourceCourseId: '1', title: 'Gradescope', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=G' }] } },
      syncMeta: { gradescope: { lastError: { at: minsAgo(1), reason: 'not_logged_in' } } },
    });
    renderIn('en', <SourceBanners store={store} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(open).toHaveBeenCalledWith('https://www.gradescope.com/login', '_blank', 'noopener');
  });
});
