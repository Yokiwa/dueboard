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
  /** Brightspace term dates (Access.StartDate / EndDate), when known. */
  start?: string | null;
  end?: string | null;
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
  /** Absolute Brightspace launch URL (a content topic's Url), used to visit the platform. */
  launchUrl?: string;
}
export interface RawLink {
  source: 'brightspace';
  sourceCourseId: string;
  title: string;
  url: string;
}

export type ConnectorFailureReason = 'not_logged_in' | 'network' | 'parse_error';
export type ConnectorResult =
  | { ok: true; courses: RawCourse[]; items: RawItem[]; links: RawLink[]; partial: string[] /* sourceCourseIds that failed */; syllabusSources?: SyllabusSource[] }
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
  /** Brightspace only: syllabus files and launches found in course content. */
  syllabusSources?: SyllabusSource[];
}

/** A syllabus DueBoard can read for one course: a file in Content, or a launch (Simple Syllabus) read by a visit. */
export interface SyllabusSource {
  ou: string;
  kind: 'pdf' | 'html' | 'visit';
  url: string;
  title: string;
  /** Brightspace LastModifiedDate, when known. */
  modified: string | null;
}
/** One dated row found in a syllabus. */
export interface SyllabusRow {
  title: string;
  dueAt: string;
  allDay: boolean;
  /** The source line, at most 120 characters. */
  excerpt: string;
}
export interface CourseSyllabus {
  /** The source's URL. */
  source: string;
  kind: SyllabusSource['kind'];
  readAt: string;
  modified: string | null;
  rows: SyllabusRow[];
  error?: 'unreadable';
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
  /** Where a date came from when not from a source's own field: a platform page, or the item's title ("_due_Nov 11"). */
  dueFrom?: 'platform' | 'title';
  /** The platform's name, for "Read from ALEKS". */
  duePlatform?: string;
  /** "Read from ALEKS: 'Due: 11/10/2026 11:59 PM'" */
  dueEvidence?: string;
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
  /** Syllabus suggestions the student hid (Suggestion.key). */
  syllabusHidden: Record<string, true>;
}
export type VisitMode = 'auto' | 'manual' | 'off';
export interface Settings {
  /** When to read platforms in a minimized window. */
  visits: VisitMode;
  /** Show dates found in syllabi as suggestions. */
  syllabus: boolean;
  /** Where finished work shows on the Courses page: at the bottom of each course card, or in a "Done this week" section. */
  completed: CompletedPlacement;
  /** Read pages the hidden frames could not read in a minimized window, in the same run. */
  windowFallback: boolean;
}
export type CompletedPlacement = 'card' | 'section';
export const DEFAULT_SETTINGS: Settings = { visits: 'auto', syllabus: true, completed: 'card', windowFallback: true };
export interface VisitState {
  /** The minimized window of a run in progress, so a restart can close it. */
  windowId?: number;
  lastRun?: string;
  /** Landing hosts DueBoard has no permission for (unknown platforms). */
  needsPermission: string[];
  /** Permission asks the student postponed: platform id or host → ISO time until which not to ask. */
  snoozed: Record<string, string>;
  /**
   * Per platform read in the background (Gradescope, Pearson): the last attempt to sign back in through a course's
   * Brightspace entry, and how many attempts in a row did not help.
   */
  sessions?: Partial<Record<SourceId, { at: string; failures: number; /** The hidden frame signed in but the platform still read as signed out: go straight to the window. */ frame?: 'failed' }>>;
  /**
   * Per platform key (see frameKey): how many hidden-frame visits in a row ended blocked, and until when frame mode
   * is skipped for it (its pages go straight to the window).
   */
  frame: Record<string, { blocked: number; skipUntil?: string }>;
}
export interface SyncMeta {
  lastSuccess?: string;
  lastError?: { at: string; reason: string; detail?: string };
}
/** A due date read on a platform page: by a visit, or when the student opened the page. */
export interface CapturedDue {
  /** "brightspace:topic:123" — set by visits. */
  itemKey?: string;
  /** The page heading; matched by title when there is no item key (1.0 behavior). */
  title: string;
  /** null: visited, nothing found. */
  dueAt: string | null;
  /** Registry id, or the landing host for unknown platforms. */
  platform: string;
  via: 'visit' | 'opened';
  evidence?: string;
  checkedAt: string;
  /** Visits in a row that found no date. */
  misses?: number;
  /** Visits in a row that failed (timeout, window closed). */
  failures?: number;
  /** The visit landed on this host without site access; wait until access is granted. */
  blocked?: string;
}

export interface StoreShape {
  schemaVersion: 1;
  snapshots: Partial<Record<SourceId, Snapshot>>;
  manualItems: ManualItem[];
  manualLinks: CourseLink[];
  userState: UserState;
  settings: Settings;
  syncMeta: Partial<Record<SourceId, SyncMeta>>;
  /** Keyed by itemKey, else "title:" + normalizeTitle(title). */
  captured: Record<string, CapturedDue>;
  visitState: VisitState;
  /** Syllabus rows read per Brightspace course (ou). */
  syllabus: Record<string, CourseSyllabus>;
  /** Weekly check of each course's navigation bar for a "Syllabus" launch (ou → result). */
  syllabusNav: Record<string, { url: string | null; checkedAt: string }>;
}
