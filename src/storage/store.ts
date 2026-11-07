import { browser } from 'wxt/browser';
import { normalizeTitle } from '../core/courseCode';
import type { CapturedDue, CourseLink, ManualItem, SourceId, Snapshot, StoreShape } from '../core/types';

const KEYS = ['schemaVersion', 'snapshots', 'manualItems', 'manualLinks', 'userState', 'settings', 'syncMeta', 'captured'] as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Turns whatever is in storage (possibly old or partial) into a complete StoreShape. */
export function migrate(raw: unknown): StoreShape {
  const r = obj(raw);
  const us = obj(r.userState);
  return {
    schemaVersion: 1,
    snapshots: obj(r.snapshots) as StoreShape['snapshots'],
    manualItems: arr(r.manualItems),
    manualLinks: arr(r.manualLinks),
    userState: {
      done: obj(us.done) as Record<string, true>,
      colors: obj(us.colors) as Record<string, string>,
      hidden: obj(us.hidden) as Record<string, true>,
      shown: obj(us.shown) as Record<string, true>,
      merges: obj(us.merges) as Record<string, string>,
    },
    settings: {},
    syncMeta: obj(r.syncMeta) as StoreShape['syncMeta'],
    captured: obj(r.captured) as StoreShape['captured'],
  };
}

export async function loadStore(): Promise<StoreShape> {
  const raw = await browser.storage.local.get([...KEYS]);
  return migrate(raw);
}

export async function patchStore(patch: Partial<StoreShape>): Promise<void> {
  await browser.storage.local.set({ ...patch, schemaVersion: 1 });
}

export async function saveSnapshot(source: SourceId, snapshot: Snapshot): Promise<void> {
  const { snapshots } = await loadStore();
  await patchStore({ snapshots: { ...snapshots, [source]: snapshot } });
}

export async function recordSyncSuccess(source: SourceId, at: string): Promise<void> {
  const { syncMeta } = await loadStore();
  await patchStore({ syncMeta: { ...syncMeta, [source]: { lastSuccess: at } } });
}

export async function recordSyncError(source: SourceId, reason: string, detail?: string): Promise<void> {
  const { syncMeta } = await loadStore();
  const prev = syncMeta[source] ?? {};
  await patchStore({
    syncMeta: { ...syncMeta, [source]: { ...prev, lastError: { at: new Date().toISOString(), reason, detail } } },
  });
}

export async function toggleDone(sourceKeys: string[], done: boolean): Promise<void> {
  const { userState } = await loadStore();
  const next = { ...userState.done };
  for (const k of sourceKeys) {
    if (done) next[k] = true;
    else delete next[k];
  }
  await patchStore({ userState: { ...userState, done: next } });
}

/** Calls cb whenever any DueBoard data in local storage changes. Returns an unsubscribe function. */
export function onStoreChange(cb: () => void): () => void {
  const listener = (_changes: unknown, area: string) => {
    if (area === 'local') cb();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function addManualItem(i: Omit<ManualItem, 'id'>): Promise<string> {
  const id = `manual:${crypto.randomUUID()}`;
  const { manualItems } = await loadStore();
  await patchStore({ manualItems: [...manualItems, { ...i, id }] });
  return id;
}

export async function removeManualItem(id: string): Promise<void> {
  const { manualItems, userState } = await loadStore();
  const done = { ...userState.done };
  delete done[id];
  await patchStore({ manualItems: manualItems.filter((m) => m.id !== id), userState: { ...userState, done } });
}

export async function addManualLink(l: CourseLink): Promise<void> {
  const { manualLinks } = await loadStore();
  if (manualLinks.some((x) => x.courseId === l.courseId && x.url === l.url)) return;
  await patchStore({ manualLinks: [...manualLinks, l] });
}

export async function removeManualLink(courseId: string, url: string): Promise<void> {
  const { manualLinks } = await loadStore();
  await patchStore({ manualLinks: manualLinks.filter((x) => !(x.courseId === courseId && x.url === url)) });
}

/** Shows or hides a course card. Works for real courses (hidden by choice) and non-course entries (hidden by default). */
export async function setCourseVisible(courseId: string, visible: boolean): Promise<void> {
  const { userState } = await loadStore();
  const hidden = { ...userState.hidden };
  const shown = { ...userState.shown };
  if (visible) {
    delete hidden[courseId];
    shown[courseId] = true;
  } else {
    hidden[courseId] = true;
    delete shown[courseId];
  }
  await patchStore({ userState: { ...userState, hidden, shown } });
}

export async function setCourseColor(courseId: string, color: string): Promise<void> {
  const { userState } = await loadStore();
  await patchStore({ userState: { ...userState, colors: { ...userState.colors, [courseId]: color } } });
}

/** target null removes the manual merge rule for this Gradescope course. */
export async function setMerge(gradescopeKey: string, target: string | null): Promise<void> {
  const { userState } = await loadStore();
  const next = { ...userState.merges };
  if (target) next[gradescopeKey] = target;
  else delete next[gradescopeKey];
  await patchStore({ userState: { ...userState, merges: next } });
}

export async function saveCapturedDue(c: CapturedDue): Promise<void> {
  const { captured } = await loadStore();
  await patchStore({ captured: { ...captured, [normalizeTitle(c.title)]: c } });
}
