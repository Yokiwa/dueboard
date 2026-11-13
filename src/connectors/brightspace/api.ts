// Response shapes of the Brightspace (D2L Valence) endpoints we read. Only fields we use.
export interface VersionInfo { ProductCode: string; LatestVersion: string }
export interface Enrollment {
  OrgUnit: { Id: number; Name: string; Code: string | null };
  Access: { IsActive: boolean; CanAccess: boolean; StartDate: string | null; EndDate: string | null };
}
export interface EnrollmentPage { PagingInfo: { Bookmark: string; HasMoreItems: boolean }; Items: Enrollment[] }
export interface DropboxFolder { Id: number; GradeItemId?: number | null; Name: string; DueDate: string | null; IsHidden: boolean; Availability?: { StartDate: string | null; EndDate: string | null } | null }
export interface GradeValue {
  GradeObjectIdentifier: string;
  GradeObjectName: string;
  PointsNumerator: number | null;
  PointsDenominator: number | null;
  DisplayedGrade: string | null;
}
export interface MySubmission { Submissions: unknown[]; CompletionDate?: string | null }
export interface Quiz { QuizId: number; GradeItemId?: number | null; Name: string; IsActive: boolean; DueDate: string | null; EndDate?: string | null }
export interface CalendarEvent {
  CalendarEventId: number;
  OrgUnitId: number;
  Title: string;
  /** The event's text as the instructor wrote it (may hold HTML). */
  Description?: string | null;
  StartDateTime: string | null;
  EndDateTime: string | null;
  /** Brightspace's all-day flag (an all-day event has no time of its own). */
  IsAllDayEvent?: boolean;
  AssociatedEntity: { AssociatedEntityType: string; AssociatedEntityId: number; Link?: string | null } | null;
  CalendarEventViewUrl?: string | null;
}
export interface ObjectListPage<T> { Objects: T[]; Next: string | null }
export interface TocTopic { TopicId?: number; Title: string; Url: string | null; DueDate?: string | null; EndDateTime?: string | null; TypeIdentifier?: string; LastModifiedDate?: string | null }
export interface TocModule { Title: string; Modules: TocModule[]; Topics: TocTopic[] }
export interface Toc { Modules: TocModule[] }

export function urls(base: string, lp: string, le: string) {
  return {
    enrollments: (bookmark?: string) =>
      `${base}/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`,
    dropbox: (ou: string) => `${base}/d2l/api/le/${le}/${ou}/dropbox/folders/`,
    mySubmissions: (ou: string, folder: number) => `${base}/d2l/api/le/${le}/${ou}/dropbox/folders/${folder}/submissions/mysubmissions/`,
    grades: (ou: string) => `${base}/d2l/api/le/${le}/${ou}/grades/values/myGradeValues/`,
    quizzes: (ou: string) => `${base}/d2l/api/le/${le}/${ou}/quizzes/`,
    toc: (ou: string) => `${base}/d2l/api/le/${le}/${ou}/content/toc`,
    calendar: (ous: string[], start: string, end: string) =>
      `${base}/d2l/api/le/${le}/calendar/events/myEvents/?orgUnitIdsCSV=${ous.join(',')}&startDateTime=${start}&endDateTime=${end}`,
  };
}
