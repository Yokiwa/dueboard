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
  saveCapturedDue,
  removeManualItem,
  addManualLink,
  removeManualLink,
} from '../../src/storage/store';
import type { Snapshot } from '../../src/core/types';

const snap = (syncedAt: string): Snapshot => ({ syncedAt, courses: [], items: [], links: [], partial: [] });

describe('store', () => {
  beforeEach(() => fakeBrowser.reset());

  it('loadStore on empty storage returns defaults', async () => {
    const s = await loadStore();
    expect(s.schemaVersion).toBe(1);
    expect(s.settings).toEqual({ language: 'auto' });
    expect(s.snapshots).toEqual({});
    expect(s.manualItems).toEqual([]);
    expect(s.manualLinks).toEqual([]);
    expect(s.userState).toEqual({ done: {}, colors: {}, hidden: {}, shown: {}, merges: {} });
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
    await patchStore({ settings: { language: 'en' } });
    const s = await loadStore();
    expect(s.settings.language).toBe('en');
    expect(s.manualItems).toEqual([]);
  });

  it('migrate fills missing keys from partial data', () => {
    const m = migrate({ settings: { language: 'zh', newtabMode: 'blank' }, userState: { done: { 'x:1': true } } });
    expect(m.schemaVersion).toBe(1);
    expect(m.settings).toEqual({ language: 'zh' });
    expect(m.userState).toEqual({ done: { 'x:1': true }, colors: {}, hidden: {}, shown: {}, merges: {} });
    expect(m.snapshots).toEqual({});
  });

  it('migrate tolerates garbage', () => {
    expect(migrate(null).settings.language).toBe('auto');
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

  it('saveCapturedDue keys by normalized title and overwrites with the newest', async () => {
    await saveCapturedDue({ title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-10T04:59:00.000Z', platform: 'wiley', capturedAt: 'a' });
    await saveCapturedDue({ title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-11T04:59:00.000Z', platform: 'wiley', capturedAt: 'b' });
    expect((await loadStore()).captured).toEqual({ phys172hhw11fa26: { title: 'PHYS 172H - HW11 - FA26', dueAt: '2026-11-11T04:59:00.000Z', platform: 'wiley', capturedAt: 'b' } });
  });
});
