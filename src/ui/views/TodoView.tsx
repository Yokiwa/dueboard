import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import type { Dashboard } from '../../core/dashboard';
import type { Course, Item } from '../../core/types';
import { removeManualItem, toggleDone } from '../../storage/store';
import { useT, type MessageKey } from '../i18n';
import { DueBadge } from '../components/DueBadge';
import { ManualItemForm } from '../components/ManualItemForm';
import { CaretRight, CheckCircle, Plus, X } from '@phosphor-icons/react';
import { primaryBtn } from '../forms';

type Group = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'noDue';
const GROUPS: [Group, MessageKey][] = [
  ['overdue', 'todo.overdue'],
  ['today', 'todo.today'],
  ['tomorrow', 'todo.tomorrow'],
  ['week', 'todo.week'],
  ['later', 'todo.later'],
  ['noDue', 'todo.noDue'],
];

function groupOf(i: Item, now: Date): Group {
  if (!i.dueAt) return 'noDue';
  const due = new Date(i.dueAt);
  if (due.getTime() <= now.getTime()) return 'overdue';
  const days = differenceInCalendarDays(due, now);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (due.getTime() - now.getTime() <= 7 * 86_400_000) return 'week';
  return 'later';
}

function Row({ item, course, now }: { item: Item; course: Course | undefined; now: Date }) {
  const t = useT();
  const done = item.doneByUser || item.submitted;
  return (
    <li className="flex items-center gap-3 border-t border-db-border-soft py-3 first:border-t-0">
      <input
        type="checkbox"
        aria-label={item.title}
        checked={done}
        disabled={item.submitted}
        onChange={(e) => void toggleDone(item.sourceKeys, e.target.checked)}
        className="size-4 shrink-0 cursor-pointer"
      />
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: course?.color }} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="todo-title"
          className={`db-press truncate rounded-sm title-4 ${done ? 'text-db-faint line-through' : 'text-db-text no-underline hover:text-db-accent'}`}
        >
          {item.title}
        </a>
        <span className="caption-5 text-db-faint">{course?.code}</span>
      </div>
      <DueBadge dueAt={item.dueAt} done={item.doneByUser} submitted={item.submitted} now={now} />
      {item.type === 'manual' && (
        <button
          type="button"
          aria-label={t('todo.delete', { title: item.title })}
          onClick={() => void removeManualItem(item.id)}
          className="db-press inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-db-faint hover:bg-db-urgent-bg hover:text-db-urgent-fg"
        >
          <X aria-hidden="true" size={14} weight="bold" />
        </button>
      )}
    </li>
  );
}

export function TodoView({ dashboard, now }: { dashboard: Dashboard; now: Date }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const courseOf = new Map(dashboard.courses.map((c) => [c.id, c]));
  const byDue = (a: Item, b: Item) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
  const sorted = [...dashboard.items].sort(byDue);
  // Finished items stay in their group (ticked) until their due time passes; then they fold into "Completed".
  const isArchived = (i: Item) => (i.doneByUser || i.submitted) && i.dueAt !== null && Date.parse(i.dueAt) <= now.getTime();
  const completed = sorted.filter(isArchived);
  const open = sorted.filter((i) => !isArchived(i));

  return (
    <section className="db-rise flex flex-col gap-6 rounded-2xl border border-db-border bg-db-surface p-6 shadow-sm">
      <div className="flex justify-end">
        {!adding && (
          <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" size={16} weight="bold" />
            {t('todo.add')}
          </button>
        )}
      </div>
      {adding && <ManualItemForm courses={dashboard.courses} onDone={() => setAdding(false)} />}
      {open.length === 0 && completed.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-2xl bg-db-accent-soft text-db-accent">
            <CheckCircle size={24} weight="fill" />
          </span>
          <p className="m-0 body-3 text-db-muted">{t('todo.empty')}</p>
        </div>
      )}
      {GROUPS.map(([g, key]) => {
        const list = open.filter((i) => groupOf(i, now) === g);
        if (list.length === 0) return null;
        const headingId = `todo-${g}`;
        return (
          <section key={g} role="region" aria-labelledby={headingId} className="flex flex-col gap-2">
            <h3 id={headingId} className={`m-0 caption-3 tracking-wide ${g === 'overdue' ? 'text-db-urgent-fg' : 'text-db-muted'}`}>
              {t(key)}
            </h3>
            <ul className="m-0 list-none p-0">
              {list.map((i) => (
                <Row key={i.id} item={i} course={courseOf.get(i.courseId)} now={now} />
              ))}
            </ul>
          </section>
        );
      })}
      {completed.length > 0 && (
        <details className="group rounded-lg">
          <summary className="db-press flex cursor-pointer list-none items-center gap-2 rounded-sm caption-3 text-db-muted hover:text-db-text [&::-webkit-details-marker]:hidden">
            <CaretRight aria-hidden="true" size={12} weight="bold" className="transition-transform duration-300 ease-db group-open:rotate-90" />
            {t('todo.completed', { n: completed.length })}
          </summary>
          <ul className="m-0 mt-2 list-none p-0">
            {completed.map((i) => (
              <Row key={i.id} item={i} course={courseOf.get(i.courseId)} now={now} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
