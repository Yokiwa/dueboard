import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import type { Dashboard } from '../../core/dashboard';
import type { Course, Item } from '../../core/types';
import { removeManualItem, toggleDone } from '../../storage/store';
import { useT, type MessageKey } from '../i18n';
import { DueBadge } from '../components/DueBadge';
import { ManualItemForm } from '../components/ManualItemForm';
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
    <li className="flex items-center gap-3 border-t border-db-border-soft py-2.5 first:border-t-0">
      <input
        type="checkbox"
        aria-label={item.title}
        checked={done}
        disabled={item.submitted}
        onChange={(e) => void toggleDone(item.sourceKeys, e.target.checked)}
        className="size-5 shrink-0 cursor-pointer accent-db-accent"
      />
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: course?.color }} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="todo-title"
          className={`truncate text-sm font-medium no-underline hover:underline ${done ? 'text-db-faint line-through' : 'text-db-text'}`}
        >
          {item.title}
        </a>
        <span className="text-xs text-db-faint">{course?.code}</span>
      </div>
      <DueBadge dueAt={item.dueAt} done={item.doneByUser} submitted={item.submitted} now={now} />
      {item.type === 'manual' && (
        <button
          type="button"
          aria-label={t('todo.delete', { title: item.title })}
          onClick={() => void removeManualItem(item.id)}
          className="min-h-9 cursor-pointer rounded-md border-0 bg-transparent px-2 text-db-faint hover:text-db-urgent-fg"
        >
          ×
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
  const completed = sorted.filter((i) => i.doneByUser || i.submitted);
  const open = sorted.filter((i) => !i.doneByUser && !i.submitted);

  return (
    <section className="flex flex-col gap-5 rounded-[14px] border border-db-border bg-db-surface p-5">
      <div className="flex justify-end">
        {!adding && (
          <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
            {t('todo.add')}
          </button>
        )}
      </div>
      {adding && <ManualItemForm courses={dashboard.courses} onDone={() => setAdding(false)} />}
      {open.length === 0 && completed.length === 0 && <p className="m-0 py-6 text-center text-db-muted">{t('todo.empty')}</p>}
      {GROUPS.map(([g, key]) => {
        const list = open.filter((i) => groupOf(i, now) === g);
        if (list.length === 0) return null;
        const headingId = `todo-${g}`;
        return (
          <section key={g} role="region" aria-labelledby={headingId} className="flex flex-col gap-1">
            <h3 id={headingId} className={`m-0 text-sm font-semibold ${g === 'overdue' ? 'text-db-urgent-fg' : 'text-db-muted'}`}>
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
        <details className="rounded-lg">
          <summary className="cursor-pointer text-sm font-semibold text-db-muted">{t('todo.completed', { n: completed.length })}</summary>
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
