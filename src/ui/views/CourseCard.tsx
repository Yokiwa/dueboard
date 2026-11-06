import { displayName } from '../../core/courseName';
import type { Course, CourseLink, Item } from '../../core/types';
import { useT } from '../i18n';
import { ItemRow } from '../components/ItemRow';
import { LinkPill } from '../components/LinkPill';
import { toggleDone } from '../../storage/store';

const SHOWN = 3;

export interface CourseCardProps {
  course: Course;
  items: Item[];
  links: CourseLink[];
  now: Date;
  onOpen(): void;
}

export function CourseCard({ course, items, links, now, onOpen }: CourseCardProps) {
  const t = useT();
  // Dated items that still matter: anything unfinished (overdue included), plus finished ones not yet past due,
  // which stay in place with a tick. Undated items live in the course detail only.
  const relevant = items.filter(
    (i) => i.dueAt && ((!i.doneByUser && !i.submitted) || Date.parse(i.dueAt) > now.getTime()),
  );
  const shown = relevant.slice(0, SHOWN);
  const name = displayName(course);
  // Lecture videos etc. found in course content only appear in the detail view; the card keeps platform shortcuts.
  const shortcuts = links.filter((l) => l.category !== 'website' || l.source === 'manual');
  return (
    <article aria-label={course.code} className="flex flex-col gap-3.5 rounded-[14px] border border-db-border bg-db-surface p-5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('course.open', { code: course.code })}
        className="flex cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left"
      >
        {name ? (
          <>
            <span className="flex items-center gap-2">
              <span data-testid="course-dot" className="size-2.5 rounded-full" style={{ background: course.color }} aria-hidden="true" />
              <span className="text-[13px] font-semibold tracking-[0.02em] text-db-muted">{course.code}</span>
            </span>
            <span className="text-lg font-semibold text-db-text">{name}</span>
          </>
        ) : (
          <span className="flex items-center gap-2">
            <span data-testid="course-dot" className="size-2.5 rounded-full" style={{ background: course.color }} aria-hidden="true" />
            <span className="text-lg font-semibold text-db-text">{course.code}</span>
          </span>
        )}
      </button>

      <div className="flex grow flex-col">
        {shown.length > 0 ? (
          <ul className="m-0 list-none p-0">
            {shown.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-t border-db-border-soft py-2.5">
                <input
                  type="checkbox"
                  aria-label={t('done.mark', { title: i.title })}
                  checked={i.doneByUser || i.submitted}
                  disabled={i.submitted}
                  onChange={(e) => void toggleDone(i.sourceKeys, e.target.checked)}
                  className="size-[18px] shrink-0 cursor-pointer accent-db-accent"
                />
                <div className="min-w-0 grow">
                  <ItemRow item={i} now={now} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 border-t border-db-border-soft py-[18px] text-sm text-db-faint">{t('course.empty')}</p>
        )}
        {relevant.length > SHOWN && (
          <button type="button" onClick={onOpen} className="cursor-pointer self-start border-0 bg-transparent p-0 pt-1 text-[13px] font-medium text-db-accent">
            {t('course.more', { n: relevant.length - SHOWN })}
          </button>
        )}
        {course.partial && <p className="m-0 pt-2 text-xs text-db-soon-fg">{t('course.partial')}</p>}
      </div>

      {shortcuts.length > 0 && (
        <div role="group" aria-label={t('course.links')} className="flex flex-wrap gap-2">
          {shortcuts.map((l) => (
            <LinkPill key={l.url} link={l} />
          ))}
        </div>
      )}
    </article>
  );
}
