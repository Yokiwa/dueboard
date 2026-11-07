import { format } from 'date-fns';
import type { Suggestion } from '../../core/syllabusSuggestions';
import type { Course } from '../../core/types';
import { addManualItem, hideSuggestion } from '../../storage/store';
import { secondaryBtn } from '../forms';
import { useT } from '../i18n';

/** What the dashboard knows about syllabi, passed down to the views that list them. */
export interface SyllabusView {
  suggestions: Suggestion[];
  /** Course ids whose syllabus couldn't be read. */
  unreadable: string[];
}

/**
 * "From syllabus": dated work found in syllabi, shown as suggestions. Add turns one into the student's own item
 * (then it counts as a deadline); Hide dismisses it for good.
 */
export function SyllabusSuggestions({ suggestions, courses, showCourse = true }: { suggestions: Suggestion[]; courses: Course[]; showCourse?: boolean }) {
  const t = useT();
  if (suggestions.length === 0) return null;
  const courseOf = new Map(courses.map((c) => [c.id, c]));
  const add = async (s: Suggestion) => {
    const course = courseOf.get(s.courseId);
    await addManualItem({ courseId: s.courseId, title: s.title, dueAt: s.dueAt, url: course?.url ?? '' });
  };
  return (
    <section role="region" aria-labelledby="syllabus-heading" className="flex flex-col gap-2">
      <h3 id="syllabus-heading" className="m-0 caption-3 tracking-wide text-db-muted">
        {t('syllabus.title')}
      </h3>
      <p className="m-0 caption-5 text-db-faint">{t('syllabus.hint')}</p>
      <ul className="m-0 list-none p-0">
        {suggestions.map((s) => {
          const course = courseOf.get(s.courseId);
          const when = format(new Date(s.dueAt), s.allDay ? 'EEE, MMM d' : 'EEE, MMM d · h:mm a');
          return (
            <li key={s.key} className="flex items-center gap-3 border-t border-db-border-soft py-3 first:border-t-0">
              {showCourse && <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: course?.color }} />}
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate title-4 text-db-text">{s.title}</span>
                <span className="caption-5 text-db-faint">{showCourse && course ? `${course.code} · ${when}` : when}</span>
                <span className="truncate caption-5 text-db-faint">{t('syllabus.from', { source: s.source, excerpt: s.excerpt })}</span>
              </div>
              <button type="button" aria-label={t('syllabus.hide', { title: s.title })} className={secondaryBtn} onClick={() => void hideSuggestion(s.key)}>
                {t('syllabus.hideLabel')}
              </button>
              <button type="button" aria-label={t('syllabus.add', { title: s.title })} className={secondaryBtn} onClick={() => void add(s)}>
                {t('syllabus.addLabel')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
