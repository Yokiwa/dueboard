import { useId } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { doneThisWeek } from '../../core/courseWeek';
import type { Course, Item } from '../../core/types';
import { toggleDone } from '../../storage/store';
import { ItemRow } from '../components/ItemRow';
import { useT } from '../i18n';

/** Finished work due from 7 days ago to 7 days ahead, across courses. Hidden when there is none. */
export function DoneThisWeek({ courses, items, now }: { courses: Course[]; items: Item[]; now: Date }) {
  const t = useT();
  const headingId = useId();
  const done = doneThisWeek(items, now);
  if (done.length === 0) return null;
  const courseOf = (i: Item) => courses.find((c) => c.id === i.courseId);
  return (
    <section aria-labelledby={headingId} className="db-rise flex flex-col gap-3 rounded-2xl border border-db-border bg-db-surface p-6 shadow-sm">
      <h2 className="m-0 flex items-center gap-2 title-2 text-db-text">
        <CheckCircle aria-hidden="true" size={20} weight="fill" className="text-db-ok" />
        <span id={headingId}>{t('courses.doneWeek')}</span>
        <span className="rounded-full bg-db-subtle px-2 caption-3 text-db-muted">{done.length}</span>
      </h2>
      <ul className="m-0 grid list-none gap-x-8 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr))]">
        {done.map((i) => {
          const c = courseOf(i);
          return (
            <li key={i.id} className="flex items-center gap-3 border-t border-db-border-soft py-3">
              <input
                type="checkbox"
                aria-label={t('done.mark', { title: i.title })}
                checked
                disabled={i.submitted}
                onChange={(e) => void toggleDone(i.sourceKeys, e.target.checked)}
                className="size-4 shrink-0 cursor-pointer"
              />
              {c && (
                <span className="flex w-24 shrink-0 items-center gap-2 caption-4 text-db-muted">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                  <span className="truncate">{c.code}</span>
                </span>
              )}
              <div className="min-w-0 grow">
                <ItemRow item={i} now={now} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
