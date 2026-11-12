import { browser } from 'wxt/browser';
import { normalizeTitle } from '../core/courseCode';
import { DEFAULT_SETTINGS, type CapturedDue, type CourseLink, type ManualItem, type Settings, type SourceId, type Snapshot, type StoreShape, type VisitState } from '../core/types';

const KEYS = ['schemaVersion', 'snapshots', 'manualItems', 'manualLinks', 'userState', 'settings', 'syncMeta', 'captured', 'visitState', 'syllabus', 'syllabusNav'] as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** The storage key of a captured date: its item, else its normalized title. */
export function capturedKey(c: Pick<CapturedDue, 'itemKey' | 'title'>): string {
  return c.itemKey ?? `title:${normalizeTitle(c.title)}`;
}

function migrateSettings(v: unknown): Settings {
  const r = obj(v);
  return {
    visits: r.visits === 'auto' || r.visits === 'manual' || r.visits === 'off' ? r.visits : DEFAULT_SETTINGS.visits,
    syllabus: typeof r.syllabus === 'boolean' ? r.syllabus : DEFAULT_SETTINGS.syllabus,
    windowFallback: typeof r.windowFallback === 'boolean' ? r.windowFallback : DEFAULT_SETTINGS.windowFallback,
    completed: r.completed === 'card' || r.completed === 'section' ? r.completed : DEFAULT_SETTINGS.completed,
  };
}

function migrateVisitState(v: unknown): VisitState {
  const r = obj(v);
  const out: VisitState = {
    needsPermission: arr<unknown>(r.needsPermission).filter((h): h is string => typeof h === 'string'),
    snoozed: obj(r.snoozed) as Record<string, string>,
    frame: {},
  };
  for (const [k, v] of Object.entries(obj(r.frame))) {
    const o = obj(v);
    if (typeof o.blocked !== 'number') continue;
    out.frame[k] = typeof o.skipUntil === 'string' ? { blocked: o.blocked, skipUntil: o.skipUntil } : { blocked: o.blocked };
  }
  if (typeof r.windowId === 'number') out.windowId = r.windowId;
  if (typeof r.lastRun === 'string') out.lastRun = r.lastRun;
  const sessions: NonNullable<VisitState['sessions']> = {};
  const legacy = obj(r.pearsonSession); // 1.1.0–1.1.3
  if (typeof legacy.at === 'string' && typeof legacy.failures === 'number') sessions.pearson = { at: legacy.at, failures: legacy.failures };
  for (const [src, v] of Object.entries(obj(r.sessions))) {
    const o = obj(v);
    if ((src === 'gradescope' || src === 'pearson') && typeof o.at === 'string' && typeof o.failures === 'number') sessions[src] = o.frame === 'failed' ? { at: o.at, failures: o.failures, frame: 'failed' } : { at: o.at, failures: o.failures };
  }
  if (Object.keys(sessions).length) out.sessions = sessions;
  return out;
}

/** 1.0 stored page captures by bare normalized title with `capturedAt`; 1.1 keys by item or "title:". */
function migrateCaptured(v: unknown): StoreShape['captured'] {
  const out: StoreShape['captured'] = {};
  for (const [key, raw] of Object.entries(obj(v))) {
    const c = obj(raw);
    if (typeof c.title !== 'string') continue;
    if (c.via === 'visit' || c.via === 'opened') {
      out[key] = c as unknown as CapturedDue;
      continue;
    }
    if (typeof c.dueAt !== 'string') continue;
    const entry: CapturedDue = {
      title: c.title,
      dueAt: c.dueAt,
      platform: c.platform === 'wiley' ? 'wileyplus' : String(c.platform ?? 'wileyplus'),
      via: 'opened',
      checkedAt: typeof c.capturedAt === 'string' ? c.capturedAt : new Date(0).toISOString(),
    };
    out[capturedKey(entry)] = entry;
  }
  return out;
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
      syllabusHidden: obj(us.syllabusHidden) as Record<string, true>,
    },
    settings: migrateSettings(r.settings),
    syncMeta: obj(r.syncMeta) as StoreShape['syncMeta'],
    captured: migrateCaptured(r.captured),
    visitState: migrateVisitState(r.visitState),
    syllabus: obj(r.syllabus) as StoreShape['syllabus'],
    syllabusNav: obj(r.syllabusNav) as StoreShape['syllabusNav'],
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

export async function saveCaptured(entries: CapturedDue[]): Promise<void> {
  if (entries.length === 0) return;
  const { captured } = await loadStore();
  const next = { ...captured };
  for (const c of entries) next[capturedKey(c)] = c;
  await patchStore({ captured: next });
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const { settings } = await loadStore();
  await patchStore({ settings: { ...settings, ...patch } });
}

export async function patchVisitState(patch: Partial<VisitState>): Promise<void> {
  const { visitState } = await loadStore();
  const next: VisitState = { ...visitState, ...patch };
  for (const k of Object.keys(patch) as (keyof VisitState)[]) if (patch[k] === undefined) delete next[k];
  await patchStore({ visitState: next });
}

/** Progress of a visit run, for the "Reading 3 of 8 platform pages…" line; null when no run is going. */
export interface VisitProgress {
  done: number;
  total: number;
  /** 'sources': the sync is still reading Brightspace and the other sources (done and total are 0 then). */
  phase?: 'sources';
}
export async function setVisitProgress(p: VisitProgress | null): Promise<void> {
  await browser.storage.local.set({ visitProgress: p });
}
export async function getVisitProgress(): Promise<VisitProgress | null> {
  const r = (await browser.storage.local.get('visitProgress')) as { visitProgress?: VisitProgress | null };
  return r.visitProgress ?? null;
}

export async function hideSuggestion(key: string): Promise<void> {
  const { userState } = await loadStore();
  await patchStore({ userState: { ...userState, syllabusHidden: { ...userState.syllabusHidden, [key]: true } } });
}

/**
 * The open visit window's id. Kept in session storage, which the browser clears on restart, so an id from an earlier
 * browser session (window ids are reused) can never point at one of the student's own windows.
 */
const sessionArea = () => (browser.storage as unknown as { session?: typeof browser.storage.local }).session ?? browser.storage.local;
export async function setVisitWindow(id: number | null): Promise<void> {
  await sessionArea().set({ visitWindowId: id });
}
export async function getVisitWindow(): Promise<number | undefined> {
  const r = (await sessionArea().get('visitWindowId')) as { visitWindowId?: number | null };
  return typeof r.visitWindowId === 'number' ? r.visitWindowId : undefined;
}

/** The tab the student is signing in with (first-run login); forgotten once they are back. */
export async function setLoginTab(id: number | null, at: number = Date.now()): Promise<void> {
  await sessionArea().set({ loginTab: id === null ? null : { id, at } });
}
export async function getLoginTab(): Promise<{ id: number; at: number } | undefined> {
  const r = (await sessionArea().get('loginTab')) as { loginTab?: { id?: unknown; at?: unknown } | null };
  const t = r.loginTab;
  return t && typeof t.id === 'number' && typeof t.at === 'number' ? { id: t.id, at: t.at } : undefined;
}

/** The local visit log (Diagnostics): the latest 100 visits. Never sent anywhere. */
const LOG_MAX = 100;
export interface StoredVisitLogEntry {
  at: string;
  key: string;
  title: string;
  site?: string;
  siteNote?: string;
  opened: string;
  landed?: string;
  frames: string[];
  clicked?: string[];
  pages?: { url: string; text: string; buttons: string[] }[];
  due?: string;
  evidence?: string;
  result: string;
  detail?: string;
  mode?: 'frame' | 'window';
}
export async function appendVisitLog(entries: StoredVisitLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const log = [...(await getVisitLog()), ...entries].slice(-LOG_MAX);
  await browser.storage.local.set({ visitLog: log });
}
export async function getVisitLog(): Promise<StoredVisitLogEntry[]> {
  const r = (await browser.storage.local.get('visitLog')) as { visitLog?: StoredVisitLogEntry[] };
  return Array.isArray(r.visitLog) ? r.visitLog : [];
}
