export type SourceId = 'brightspace' | 'gradescope' | 'pearson';
/** Always synced. */
export const SOURCES: SourceId[] = ['brightspace', 'gradescope'];
/** Every platform DueBoard can read; the extra ones only sync when the student's courses use them. */
export const ALL_SOURCES: SourceId[] = ['brightspace', 'gradescope', 'pearson'];
export type ItemType = 'assignment' | 'quiz' | 'exam' | 'event' | 'manual';
export type LinkCategory = 'textbook' | 'homework' | 'discussion' | 'website' | 'lms' | 'other';

export interface RawCourse {
  source: SourceId;
  sourceCourseId: string;
  name: string;
  code: string | null;
  url: string;
}
export interface RawItem {
  source: SourceId;
  sourceItemId: string;
  sourceCourseId: string;
  title: string;
  type: ItemType;
  dueAt: string | null;
  url: string;
  submitted: boolean;
}
export interface RawLink {
  source: 'brightspace';
  sourceCourseId: string;
  title: string;
  url: string;
}

export type ConnectorFailureReason = 'not_logged_in' | 'network' | 'parse_error';
export type ConnectorResult =
  | { ok: true; courses: RawCourse[]; items: RawItem[]; links: RawLink[]; partial: string[] /* sourceCourseIds that failed */ }
  | { ok: false; reason: ConnectorFailureReason; detail?: string };
export interface Connector {
  id: SourceId;
  fetchAll(): Promise<ConnectorResult>;
}

export interface Snapshot {
  syncedAt: string;
  courses: RawCourse[];
  items: RawItem[];
  links: RawLink[];
  partial: string[];
}

export interface Course {
  id: string;
  code: string;
  name: string;
  sources: Partial<Record<SourceId, string>>;
  color: string;
  hidden: boolean;
  url: string;
  partial: boolean;
  /** false for Brightspace org units without a course code (orientation, trainings…): hidden unless shown. Gradescope courses are always true. */
  isCourse: boolean;
}
export interface Item {
  id: string;
  courseId: string;
  title: string;
  type: ItemType;
  dueAt: string | null;
  url: string;
  sources: (SourceId | 'manual')[];
  /** "<source>:<sourceItemId>" for every merged source; keys of UserState.done */
  sourceKeys: string[];
  submitted: boolean;
  doneByUser: boolean;
}
export interface CourseLink {
  courseId: string;
  label: string;
  url: string;
  category: LinkCategory;
  source: 'brightspace' | 'manual';
}
export interface ManualItem {
  id: string;
  courseId: string;
  title: string;
  dueAt: string | null;
  url: string;
}
export interface UserState {
  done: Record<string, true>;
  colors: Record<string, string>;
  hidden: Record<string, true>;
  /** Non-course entries the user chose to show (they are hidden by default). */
  shown: Record<string, true>;
  /** "gradescope:<id>" → Course.id of the Brightspace course it should merge into */
  merges: Record<string, string>;
}
export interface Settings {
  language: 'auto' | 'zh' | 'en';
}
export interface SyncMeta {
  lastSuccess?: string;
  lastError?: { at: string; reason: string; detail?: string };
}
export interface StoreShape {
  schemaVersion: 1;
  snapshots: Partial<Record<SourceId, Snapshot>>;
  manualItems: ManualItem[];
  manualLinks: CourseLink[];
  userState: UserState;
  settings: Settings;
  syncMeta: Partial<Record<SourceId, SyncMeta>>;
}
