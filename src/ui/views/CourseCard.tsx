import { displayName } from '../../core/courseName';
import type { Course, CourseLink, Item } from '../../core/types';
import { useT } from '../i18n';
import { tint } from '../tint';
import { ItemRow } from '../components/ItemRow';
import { LinkPill } from '../components/LinkPill';
import { toggleDone } from '../../storage/store';
import { CaretRight, WarningCircle } from '@phosphor-icons/react';

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
    <article aria-label={course.code} className="db-rise flex flex-col gap-4 rounded-2xl border border-db-border bg-db-surface p-6 shadow-sm transition-shadow duration-300 ease-db hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('course.open', { code: course.code })}
        className="db-press group -m-2 flex cursor-pointer items-start justify-between gap-3 rounded-lg border-0 bg-transparent p-2 text-left hover:bg-db-hover"
      >
        <span className="flex min-w-0 flex-col gap-1">
        {name ? (
          <>
            <span className="inline-flex items-center gap-2 self-start rounded-md px-2 py-0.5 caption-3 text-db-text" style={{ background: tint(course.color, 16) }}>
              <span data-testid="course-dot" className="size-2 rounded-full" style={{ background: course.color }} aria-hidden="true" />
              {course.code}
            </span>
            <span className="title-2 text-db-text">{name}</span>
          </>
        ) : (
          <span className="flex items-center gap-2">
            <span data-testid="course-dot" className="size-2 rounded-full" style={{ background: course.color }} aria-hidden="true" />
            <span className="title-2 text-db-text">{course.code}</span>
          </span>
        )}
        </span>
        <CaretRight
          aria-hidden="true"
          size={16}
          weight="bold"
          className="mt-1 shrink-0 text-db-faint transition-transform duration-300 ease-db group-hover:translate-x-0.5 group-hover:text-db-text"
        />
      </button>

      <div className="flex grow flex-col">
        {shown.length > 0 ? (
          <ul className="m-0 list-none p-0">
            {shown.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-t border-db-border-soft py-3">
                <input
                  type="checkbox"
                  aria-label={t('done.mark', { title: i.title })}
                  checked={i.doneByUser || i.submitted}
                  disabled={i.submitted}
                  onChange={(e) => void toggleDone(i.sourceKeys, e.target.checked)}
                  className="size-4 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 grow">
                  <ItemRow item={i} now={now} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 border-t border-db-border-soft py-4 body-6 text-db-faint">{t('course.empty')}</p>
        )}
        {relevant.length > SHOWN && (
          <button type="button" onClick={onOpen} className="db-press mt-1 cursor-pointer self-start rounded-sm border-0 bg-transparent p-0 body-5 text-db-accent hover:underline hover:underline-offset-4">
            {t('course.more', { n: relevant.length - SHOWN })}
          </button>
        )}
        {course.partial && (
          <p className="m-0 flex items-center gap-1 pt-2 caption-4 text-db-soon-fg">
            <WarningCircle aria-hidden="true" size={14} weight="fill" className="shrink-0" />
            {t('course.partial')}
          </p>
        )}
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
