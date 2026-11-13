import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import type { Dashboard } from '../../core/dashboard';
import type { Course, Item } from '../../core/types';
import { removeManualItem, toggleDone } from '../../storage/store';
import { useT, type MessageKey } from '../i18n';
import { DueBadge } from '../components/DueBadge';
import { ManualItemForm } from '../components/ManualItemForm';
import { CaretRight, CheckCircle, Plus, X } from '@phosphor-icons/react';
import { secondaryBtn } from '../forms';
import { SyllabusSuggestions, type SyllabusView } from '../components/SyllabusSuggestions';

/** Overdue items shown before "Show all N overdue". */
const OVERDUE_SHOWN = 3;

type Group = 'overdue' | 'today' | 'week' | 'later' | 'noDue';
const GROUPS: [Group, MessageKey][] = [
  ['overdue', 'todo.overdue'],
  ['today', 'todo.today'],
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
  // Tomorrow is part of this week: its badge already says "Tomorrow".
  if (days === 1) return 'week';
  if (due.getTime() - now.getTime() <= 7 * 86_400_000) return 'week';
  return 'later';
}

function dateSource(item: Item, t: ReturnType<typeof useT>): string | undefined {
  // dueEvidence already reads "Read from ALEKS: '…'".
  if (item.dueFrom === 'platform') return item.dueEvidence ?? t('item.readFrom', { platform: item.duePlatform ?? '' });
  return item.dueFrom === 'title' ? t('item.fromTitle') : undefined;
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
        onChange={(e) => void toggleDone(item.sourceKeys, e.target.checked, { auto: item.submitted || !!item.sourcesDone })}
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
        {/* The course only; where a date came from (a platform page, the title) is in the tooltip. */}
        <span className="caption-5 text-db-faint" title={dateSource(item, t)}>
          {course?.code}
        </span>
      </div>
      {/* Undated work sits under "No due date": no badge repeating it. */}
      {(item.dueAt || done) && (
        <DueBadge dueAt={item.dueAt} done={item.doneByUser} submitted={item.submitted} score={item.score} doneBy={item.doneBy} now={now} showLate />
      )}
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

export function TodoView({ dashboard, now, syllabus }: { dashboard: Dashboard; now: Date; syllabus?: SyllabusView }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [allOverdue, setAllOverdue] = useState(false);
  const courseOf = new Map(dashboard.courses.map((c) => [c.id, c]));
  const byDue = (a: Item, b: Item) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
  const sorted = [...dashboard.items].sort(byDue);
  // Finished items stay in their group (ticked) until their due time passes; then they fold into "Completed".
  const isArchived = (i: Item) => (i.doneByUser || i.submitted) && i.dueAt !== null && Date.parse(i.dueAt) <= now.getTime();
  const completed = sorted.filter(isArchived);
  const open = sorted.filter((i) => !isArchived(i));
  // Past-due work nobody could check goes in its own section: Overdue then holds only work not handed in.
  const notSure = open.filter((i) => i.notSure && groupOf(i, now) === 'overdue').reverse();
  const toDo = open.filter((i) => !i.doneByUser && !i.submitted).length;
  const row = (i: Item) => <Row key={i.id} item={i} course={courseOf.get(i.courseId)} now={now} />;

  return (
    <section className="db-rise flex flex-col gap-6 rounded-2xl border border-db-border bg-db-surface p-6 shadow-sm">
      <div className="flex min-h-9 items-center justify-between gap-4">
        <p className="m-0 caption-2 text-db-muted">{toDo > 0 ? t('todo.summary', { n: toDo }) : ''}</p>
        {!adding && (
          <button type="button" className={secondaryBtn} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" size={14} weight="bold" />
            {t('todo.add')}
          </button>
        )}
      </div>
      {adding && <ManualItemForm courses={dashboard.courses} onDone={() => setAdding(false)} />}
      {open.length === 0 && completed.length === 0 && !syllabus?.suggestions.length && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-2xl bg-db-accent-soft text-db-accent">
            <CheckCircle size={24} weight="fill" />
          </span>
          <p className="m-0 body-3 text-db-muted">{t('todo.empty')}</p>
        </div>
      )}
      {GROUPS.map(([g, key]) => {
        const section = g === 'overdue' && notSure.length > 0 ? <Collapsed key="notSure" label={t('todo.notSure', { n: notSure.length })} hint={t('item.notSureHint')}>{notSure.map(row)}</Collapsed> : null;
        let list = open.filter((i) => groupOf(i, now) === g && !(g === 'overdue' && i.notSure));
        if (list.length === 0) return section;
        // Overdue: the most recently due first, the first few unless asked for all.
        const total = list.length;
        if (g === 'overdue') {
          list = [...list].reverse();
          if (!allOverdue && total > OVERDUE_SHOWN + 1) list = list.slice(0, OVERDUE_SHOWN);
        }
        const headingId = `todo-${g}`;
        return [
          <section key={g} role="region" aria-labelledby={headingId} className="flex flex-col gap-1">
            <h3 id={headingId} className={`m-0 flex items-baseline gap-2 caption-3 tracking-wide ${g === 'overdue' ? 'text-db-urgent-fg' : 'text-db-muted'}`}>
              {t(key)}
              <span aria-hidden="true" className="caption-4 text-db-faint tabular-nums">{total}</span>
            </h3>
            <ul className="m-0 list-none p-0">{list.map(row)}</ul>
            {/* Collapsed only when that hides at least two: a button for one more is noise. */}
            {g === 'overdue' && total > OVERDUE_SHOWN + 1 && (
              <button type="button" onClick={() => setAllOverdue((v) => !v)} className="db-press self-start cursor-pointer rounded-sm border-0 bg-transparent p-0 caption-3 text-db-muted hover:text-db-text">
                {allOverdue ? t('todo.showFewer') : t('todo.showAllOverdue', { n: total })}
              </button>
            )}
          </section>,
          section,
        ];
      })}
      {syllabus && <SyllabusSuggestions suggestions={syllabus.suggestions} courses={dashboard.courses} />}
      {completed.length > 0 && <Collapsed label={t('todo.completed', { n: completed.length })}>{completed.map(row)}</Collapsed>}
    </section>
  );
}

/** A collapsed list under one line ("Completed (3)"), with an optional note shown when it is opened. */
function Collapsed({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg">
      <summary className="db-press flex cursor-pointer list-none items-center gap-2 rounded-sm caption-3 text-db-muted hover:text-db-text [&::-webkit-details-marker]:hidden">
        <CaretRight aria-hidden="true" size={12} weight="bold" className="transition-transform duration-300 ease-db group-open:rotate-90" />
        {label}
      </summary>
      {hint && <p className="m-0 mt-2 caption-4 text-db-faint">{hint}</p>}
      <ul className="m-0 mt-2 list-none p-0">{children}</ul>
    </details>
  );
}
