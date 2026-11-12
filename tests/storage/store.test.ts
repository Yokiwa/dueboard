import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import {
  loadStore,
  migrate,
  patchStore,
  saveSnapshot,
  recordSyncError,
  recordSyncSuccess,
  toggleDone,
  onStoreChange,
  addManualItem,
  setCourseVisible,
  saveCaptured,
  saveSettings,
  patchVisitState,
  removeManualItem,
  addManualLink,
  removeManualLink,
} from '../../src/storage/store';
import { DEFAULT_SETTINGS, type Snapshot } from '../../src/core/types';

const snap = (syncedAt: string): Snapshot => ({ syncedAt, courses: [], items: [], links: [], partial: [] });

describe('store', () => {
  beforeEach(() => fakeBrowser.reset());

  it('loadStore on empty storage returns defaults', async () => {
    const s = await loadStore();
    expect(s.schemaVersion).toBe(1);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.settings.visits).toBe('auto');
    expect(s.visitState).toEqual({ needsPermission: [], snoozed: {}, frame: {} });
    expect(s.snapshots).toEqual({});
    expect(s.manualItems).toEqual([]);
    expect(s.manualLinks).toEqual([]);
    expect(s.userState).toEqual({ done: {}, notDone: {}, colors: {}, hidden: {}, shown: {}, merges: {}, syllabusHidden: {} });
    expect(s.syncMeta).toEqual({});
  });

  it('saveSnapshot keeps other source', async () => {
    await saveSnapshot('gradescope', snap('2026-11-04T10:00:00.000Z'));
    await saveSnapshot('brightspace', snap('2026-11-04T11:00:00.000Z'));
    const s = await loadStore();
    expect(s.snapshots.gradescope?.syncedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(s.snapshots.brightspace?.syncedAt).toBe('2026-11-04T11:00:00.000Z');
  });

  it('toggleDone true then false', async () => {
    await toggleDone(['brightspace:1', 'gradescope:2'], true);
    expect((await loadStore()).userState.done).toEqual({ 'brightspace:1': true, 'gradescope:2': true });
    await toggleDone(['brightspace:1', 'gradescope:2'], false);
    expect((await loadStore()).userState.done).toEqual({});
  });

  it('recordSyncSuccess clears lastError, recordSyncError keeps lastSuccess', async () => {
    await recordSyncSuccess('brightspace', '2026-11-04T10:00:00.000Z');
    await recordSyncError('brightspace', 'network', 'HTTP 500');
    let meta = (await loadStore()).syncMeta.brightspace!;
    expect(meta.lastSuccess).toBe('2026-11-04T10:00:00.000Z');
    expect(meta.lastError).toMatchObject({ reason: 'network', detail: 'HTTP 500' });
    await recordSyncSuccess('brightspace', '2026-11-04T11:00:00.000Z');
    meta = (await loadStore()).syncMeta.brightspace!;
    expect(meta.lastError).toBeUndefined();
  });

  it('patchStore merges top-level keys', async () => {
    await patchStore({ manualLinks: [{ courseId: 'c', label: 'L', url: 'https://x', category: 'other', source: 'manual' }] });
    const s = await loadStore();
    expect(s.manualLinks).toHaveLength(1);
    expect(s.manualItems).toEqual([]);
  });

  it('migrate fills missing keys from partial data', () => {
    const m = migrate({ settings: { language: 'zh', newtabMode: 'blank' }, userState: { done: { 'x:1': true } } });
    expect(m.schemaVersion).toBe(1);
    expect(m.settings).toEqual(DEFAULT_SETTINGS); // old language setting is dropped
    expect(m.userState).toEqual({ done: { 'x:1': true }, notDone: {}, colors: {}, hidden: {}, shown: {}, merges: {}, syllabusHidden: {} });
    expect(m.snapshots).toEqual({});
    // A store from 1.4.9 has no completion records yet.
    expect(m.completion).toEqual({});
  });

  it('migrate tolerates garbage', () => {
    expect(migrate(null).settings).toEqual(DEFAULT_SETTINGS);
    expect(migrate({ settings: { visits: 'sometimes', syllabus: 'yes' } }).settings).toEqual(DEFAULT_SETTINGS);
    expect(migrate({ visitState: { needsPermission: 'x', snoozed: [] } }).visitState).toEqual({ needsPermission: [], snoozed: {}, frame: {} });
    expect(migrate('x').manualItems).toEqual([]);
  });

  it('onStoreChange fires on local storage changes and can unsubscribe', async () => {
    const cb = vi.fn();
    const off = onStoreChange(cb);
    await browser.storage.local.set({ settings: { language: 'en' } });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    await browser.storage.local.set({ manualItems: [] });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('addManualItem assigns a manual: id and removeManualItem deletes it with its done flag', async () => {
    const id = await addManualItem({ courseId: 'brightspace:1', title: 'WebAssign 14.3', dueAt: null, url: 'https://www.webassign.net/' });
    expect(id).toMatch(/^manual:[0-9a-f-]{36}$/);
    await toggleDone([id], true);
    expect((await loadStore()).manualItems).toHaveLength(1);
    await removeManualItem(id);
    const s = await loadStore();
    expect(s.manualItems).toEqual([]);
    expect(s.userState.done).toEqual({});
  });

  it('addManualLink ignores an exact duplicate; removeManualLink removes by course and url', async () => {
    const l = { courseId: 'brightspace:1', label: 'Piazza', url: 'https://piazza.com/x', category: 'discussion' as const, source: 'manual' as const };
    await addManualLink(l);
    await addManualLink(l);
    expect((await loadStore()).manualLinks).toHaveLength(1);
    await removeManualLink('brightspace:1', 'https://piazza.com/x');
    expect((await loadStore()).manualLinks).toEqual([]);
  });

  it('setCourseVisible flips hidden/shown together', async () => {
    await setCourseVisible('brightspace:51', true);
    expect((await loadStore()).userState).toMatchObject({ hidden: {}, shown: { 'brightspace:51': true } });
    await setCourseVisible('brightspace:51', false);
    expect((await loadStore()).userState).toMatchObject({ hidden: { 'brightspace:51': true }, shown: {} });
  });

  it('migrate: windowFallback defaults to true and keeps a stored boolean; visitState.frame and session frame survive', () => {
    expect(migrate({}).settings.windowFallback).toBe(true);
    expect(migrate({ settings: { windowFallback: false } }).settings.windowFallback).toBe(false);
    expect(migrate({ settings: { windowFallback: 'no' } }).settings.windowFallback).toBe(true);
    expect(migrate({}).visitState.frame).toEqual({});
    const v = migrate({ visitState: { frame: { aleks: { blocked: 2, skipUntil: 'x' }, bad: { blocked: 'y' } }, sessions: { pearson: { at: 'a', failures: 1, frame: 'failed' } } } }).visitState;
    expect(v.frame).toEqual({ aleks: { blocked: 2, skipUntil: 'x' } });
    expect(v.sessions?.pearson).toEqual({ at: 'a', failures: 1, frame: 'failed' });
  });

  it('migrate keeps valid settings', () => {
    expect(migrate({ settings: { visits: 'manual', syllabus: false, completed: 'section' } }).settings).toEqual({ visits: 'manual', syllabus: false, completed: 'section', windowFallback: true });
  });

  it('finished work shows in the course cards unless set to its own section', () => {
    expect(migrate({ settings: { visits: 'manual', syllabus: true } }).settings.completed).toBe('card');
    expect(migrate({ settings: { completed: 'elsewhere' } }).settings.completed).toBe('card');
  });

  it('migrate moves 1.0 page captures to title keys', () => {
    const m = migrate({
      captured: { phys172hhw11fa26: { title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', platform: 'wiley', capturedAt: 'b' } },
    });
    expect(m.captured).toEqual({
      'title:phys172hhw11fa26': { title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: 'b' },
    });
  });

  it('migrate keeps 1.1 captures as they are', () => {
    const c = { itemKey: 'brightspace:topic:1', title: 'HW 1', dueAt: null, platform: 'aleks', via: 'visit', checkedAt: 'a', misses: 1 };
    expect(migrate({ captured: { 'brightspace:topic:1': c } }).captured).toEqual({ 'brightspace:topic:1': c });
  });

  it('saveCaptured keys by item, else by normalized title, and overwrites with the newest', async () => {
    await saveCaptured([
      { title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: 'a' },
      { itemKey: 'brightspace:topic:9', title: 'Homework 7', dueAt: '2026-11-11T04:59:00.000Z', platform: 'aleks', via: 'visit', checkedAt: 'a' },
    ]);
    await saveCaptured([{ title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-11T04:59:00.000Z', platform: 'wileyplus', via: 'opened', checkedAt: 'b' }]);
    const { captured } = await loadStore();
    expect(Object.keys(captured).sort()).toEqual(['brightspace:topic:9', 'title:phys172hhw11fa26']);
    expect(captured['title:phys172hhw11fa26']!.checkedAt).toBe('b');
  });

  it('saveSettings merges into the current settings', async () => {
    await saveSettings({ visits: 'off' });
    expect((await loadStore()).settings).toEqual({ visits: 'off', syllabus: true, completed: 'card', windowFallback: true });
  });

  it('patchVisitState merges into the current visit state', async () => {
    await patchVisitState({ windowId: 7 });
    await patchVisitState({ needsPermission: ['learn.example.com'] });
    expect((await loadStore()).visitState).toEqual({ windowId: 7, needsPermission: ['learn.example.com'], snoozed: {}, frame: {} });
  });
});

describe('visit progress', () => {
  beforeEach(() => fakeBrowser.reset());
  it('is stored and cleared', async () => {
    const { setVisitProgress, getVisitProgress } = await import('../../src/storage/store');
    expect(await getVisitProgress()).toBeNull();
    await setVisitProgress({ done: 3, total: 8 });
    expect(await getVisitProgress()).toEqual({ done: 3, total: 8 });
    await setVisitProgress(null);
    expect(await getVisitProgress()).toBeNull();
  });
});

describe('default settings', () => {
  it('a new install reads platform pages automatically, in the background', () => {
    expect(migrate({}).settings.visits).toBe('auto');
  });
  it('a choice the student made is kept', () => {
    expect(migrate({ settings: { visits: 'manual', syllabus: true } }).settings.visits).toBe('manual');
  });
});

describe('visit log', () => {
  beforeEach(() => fakeBrowser.reset());
  it('keeps the latest 100 entries', async () => {
    const { appendVisitLog, getVisitLog } = await import('../../src/storage/store');
    const entry = (n: number) => ({ at: String(n), key: `k${n}`, title: `T${n}`, opened: 'o', frames: [], result: 'none' });
    await appendVisitLog(Array.from({ length: 80 }, (_, i) => entry(i)));
    await appendVisitLog(Array.from({ length: 30 }, (_, i) => entry(80 + i)));
    const log = await getVisitLog();
    expect(log).toHaveLength(100);
    expect(log[0]!.key).toBe('k10');
    expect(log.at(-1)!.key).toBe('k109');
  });
});

describe('sign-in sessions', () => {
  it('1.1 Pearson session attempts carry over', () => {
    expect(migrate({ visitState: { needsPermission: [], snoozed: {}, pearsonSession: { at: 'a', failures: 2 } } }).visitState.sessions).toEqual({ pearson: { at: 'a', failures: 2 } });
  });
});
