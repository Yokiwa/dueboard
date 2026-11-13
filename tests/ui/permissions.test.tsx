import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => ({})) }));
vi.mock('../../src/ui/config', () => ({ FEEDBACK_URL: 'https://forms.gle/test' }));
import { sendToBackground } from '../../src/ui/messaging';
import { PlatformAccess } from '../../src/ui/components/PermissionBanner';
import { SiteAccessBanner } from '../../src/ui/components/SiteAccessBanner';
import { ItemRow } from '../../src/ui/components/ItemRow';
import { Header } from '../../src/ui/components/Header';
import { Settings } from '../../src/entrypoints/options/Settings';
import { loadStore, migrate, patchStore, saveSnapshot } from '../../src/storage/store';
import { REQUIRED_ORIGINS } from '../../src/core/permissions';
import type { Item } from '../../src/core/types';

const now = new Date('2026-11-07T12:00:00-05:00');
const LTI = (r: string) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti&rcode=${r}`;
const storeLinking = (...titles: string[]) =>
  migrate({ snapshots: { brightspace: { syncedAt: 'x', partial: [], items: [], courses: [], links: titles.map((t, i) => ({ source: 'brightspace', sourceCourseId: '1', title: t, url: LTI(String(i)) })) } } });

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(sendToBackground).mockClear();
});

describe('PlatformAccess banner', () => {
  it('names the platforms found and asks for all their sites with one click', async () => {
    const request = vi.fn(async () => true);
    (browser.permissions as unknown as { request: unknown }).request = request;
    render(<PlatformAccess store={storeLinking('ALEKS', 'InQuizitive')} granted={[]} now={now} />);
    expect(screen.getByText('DueBoard found ALEKS and Norton in your courses. Allow it to read their due dates?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ origins: ['https://*.aleks.com/*', 'https://*.wwnorton.com/*'] }));
    await waitFor(() => expect(sendToBackground).toHaveBeenCalledWith({ type: 'sync', trigger: 'manual' }));
  });

  it('"Not now" postpones each ask for a week', async () => {
    render(<PlatformAccess store={storeLinking('ALEKS')} granted={[]} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(async () => expect((await loadStore()).visitState.snoozed.aleks).toBe(new Date(now.getTime() + 7 * 86_400_000).toISOString()));
  });

  it('shows nothing when there is nothing to ask', () => {
    const { container } = render(<PlatformAccess store={storeLinking('ALEKS')} granted={['https://*/*']} now={now} />);
    expect(container.textContent).toBe('');
  });
});

describe('SiteAccessBanner', () => {
  it('asks to restore required site access (Firefox lets users remove it)', async () => {
    const request = vi.fn(async () => true);
    (browser.permissions as unknown as { request: unknown }).request = request;
    const granted = REQUIRED_ORIGINS.filter((o) => !o.includes('gradescope') && !o.includes('pearson.com'));
    render(<SiteAccessBanner granted={granted} />);
    expect(screen.getByText("DueBoard can't reach Gradescope and Pearson. Allow access to keep syncing.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ origins: ['https://*.gradescope.com/*', 'https://*.pearson.com/*', 'https://mylab.pearson.com/*'] }));
  });
  it('is empty with full access', () => {
    expect(render(<SiteAccessBanner granted={REQUIRED_ORIGINS} />).container.textContent).toBe('');
  });
});

describe('date origin on items', () => {
  it('shows where a platform date was read', () => {
    const item: Item = {
      id: 'brightspace:topic:1', courseId: 'brightspace:1', title: 'Homework 7', type: 'assignment', dueAt: '2026-11-11T04:59:00.000Z', url: 'u',
      sources: ['brightspace'], sourceKeys: ['brightspace:topic:1'], submitted: false, doneByUser: false,
      dueFrom: 'platform', duePlatform: 'ALEKS', dueEvidence: "Read from ALEKS: 'Due: 11/10/2026 11:59 PM'",
    };
    render(<ItemRow item={item} now={now} />);
    const caption = screen.getByText(/^Read from ALEKS · /);
    expect(caption.getAttribute('title')).toBe("Read from ALEKS: 'Due: 11/10/2026 11:59 PM'");
  });
});

describe('visit progress in the header', () => {
  it('replaces the sync status while platform pages are read', () => {
    render(<Header now={now} pendingWeek={1} lastSynced={null} syncing progress={{ done: 3, total: 8 }} onRefresh={() => {}} />);
    expect(screen.getByText('Reading 3 of 8 platform pages…')).toBeTruthy();
  });
});

describe('Settings: reading platforms', () => {
  beforeEach(async () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '1.1.0' } as never);
    (browser.permissions as unknown as { getAll: unknown }).getAll = vi.fn(async () => ({ origins: [...REQUIRED_ORIGINS, 'https://*.turnitin.com/*'], permissions: [] }));
    await saveSnapshot('brightspace', { syncedAt: 'x', partial: [], items: [], links: [], courses: [{ source: 'brightspace', sourceCourseId: '1', name: 'MA 16100', code: 'MA 16100', url: 'u' }] });
  });

  it('saves when to read platforms', async () => {
    render(<Settings />);
    const select = await screen.findByLabelText('Read homework pages from your platforms');
    fireEvent.change(select, { target: { value: 'manual' } });
    await waitFor(async () => expect((await loadStore()).settings.visits).toBe('manual'));
    expect(screen.getByRole('option', { name: 'Only when I click Refresh' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Never' })).toBeTruthy();
  });

  it('lists platform access and removes it', async () => {
    const remove = vi.fn(async () => true);
    (browser.permissions as unknown as { remove: unknown }).remove = remove;
    render(<Settings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Turnitin' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ origins: ['https://*.turnitin.com/*'] }));
  });

  it('turns syllabus suggestions off', async () => {
    await patchStore({ settings: { visits: 'auto', syllabus: true, completed: 'card', windowFallback: true, theme: 'automatic' } });
    render(<Settings />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Syllabus suggestions' }));
    await waitFor(async () => expect((await loadStore()).settings.syllabus).toBe(false));
  });
});

describe('date origin in the to-do list', () => {
  it('shows where a platform date was read next to the course', async () => {
    const { TodoView } = await import('../../src/ui/views/TodoView');
    const item: Item = {
      id: 'brightspace:topic:1', courseId: 'brightspace:1', title: 'Homework 7', type: 'assignment', dueAt: '2026-11-11T04:59:00.000Z', url: 'u',
      sources: ['brightspace'], sourceKeys: ['brightspace:topic:1'], submitted: false, doneByUser: false,
      dueFrom: 'platform', duePlatform: 'ALEKS', dueEvidence: "Read from ALEKS: 'Due: 11/10/2026 11:59 PM'",
    };
    const course = { id: 'brightspace:1', code: 'MA 16100', name: 'MA 16100', sources: {}, color: '#000', hidden: false, url: '', partial: false, isCourse: true };
    render(<TodoView dashboard={{ courses: [course], items: [item], links: [], nextDue: null, meetings: [] }} now={now} />);
    // The To-do line shows the course only; where the date was read is its tooltip.
    const caption = screen.getByText('MA 16100');
    expect(caption.getAttribute('title')).toBe("Read from ALEKS: 'Due: 11/10/2026 11:59 PM'");
  });
});

describe('next-deadline banner names the platform a date was read from', () => {
  it('says ALEKS, not Brightspace', async () => {
    const { NextDueBanner } = await import('../../src/ui/components/NextDueBanner');
    const item: Item = {
      id: 'brightspace:topic:1', courseId: 'brightspace:1', title: 'Homework 7', type: 'assignment', dueAt: '2026-11-11T04:59:00.000Z', url: 'u',
      sources: ['brightspace'], sourceKeys: ['brightspace:topic:1'], submitted: false, doneByUser: false, dueFrom: 'platform', duePlatform: 'ALEKS',
    };
    render(<NextDueBanner item={item} course={undefined} now={now} />);
    expect(screen.getByText(/^ALEKS · /)).toBeTruthy();
    expect(screen.queryByText(/^Brightspace · /)).toBeNull();
  });
});

describe('date origin: title', () => {
  it('says a date came from the title', async () => {
    const { TodoView } = await import('../../src/ui/views/TodoView');
    const item: Item = {
      id: 'brightspace:topic:7', courseId: 'brightspace:7', title: 'HW11 (10.3, 12.1)_due_Nov 11', type: 'assignment', dueAt: '2026-11-12T04:59:00.000Z', url: 'u',
      sources: ['brightspace'], sourceKeys: ['brightspace:topic:7'], submitted: false, doneByUser: false, dueFrom: 'title',
    };
    const course = { id: 'brightspace:7', code: 'CHM 11510', name: 'CHM 11510', sources: {}, color: '#000', hidden: false, url: '', partial: false, isCourse: true };
    render(<TodoView dashboard={{ courses: [course], items: [item], links: [], nextDue: null, meetings: [] }} now={now} />);
    expect(screen.getByText('CHM 11510').getAttribute('title')).toBe('Date from title');
    render(<ItemRow item={item} now={now} />);
    expect(screen.getByText(/^Date from title · /)).toBeTruthy();
  });
});
