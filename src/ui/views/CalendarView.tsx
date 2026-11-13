import { useMemo, useState } from 'react';
import { addMonths, addWeeks, format, isSameDay, isSameMonth } from 'date-fns';
import type { Dashboard } from '../../core/dashboard';
import type { Course, Item, Meeting } from '../../core/types';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { iconBtn, secondaryBtn } from '../forms';
import { useT } from '../i18n';
import { dayKey, itemsByDay, layoutDay, monthCells, timeRange, weekDays, weekHours, type PlacedMeeting } from './calendarGrid';

type Mode = 'week' | 'month';
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LIMIT = 3;

function Chip({ item, course, now }: { item: Item; course: Course | undefined; now: Date }) {
  const t = useT();
  const done = item.doneByUser || item.submitted;
  const overdue = !done && Date.parse(item.dueAt!) <= now.getTime();
  const time = format(new Date(item.dueAt!), 'h:mm a');
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-done={String(done)}
      data-overdue={String(overdue)}
      title={course ? `${course.code} · ${item.title}` : item.title}
      className={`db-press flex min-w-0 flex-col gap-1 rounded-lg border border-db-border-soft border-l-[3px] bg-db-subtle px-2.5 py-2 hover:bg-db-hover ${
        done ? 'text-db-faint line-through' : overdue ? 'text-db-urgent-fg no-underline' : 'text-db-text no-underline'
      }`}
      style={{ borderLeftColor: course?.color }}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span data-testid="chip-dot" aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full" style={{ background: course?.color }} />
        <span className="min-w-0 break-words caption-3 leading-snug">{item.title}</span>
      </span>
      <span className="flex min-w-0 items-center justify-between gap-2 pl-4 text-db-faint">
        <span data-testid="chip-course" className="min-w-0 truncate caption-5 no-underline">{course?.code ?? t('cal.noCourse')}</span>
        <span className="shrink-0 font-mono caption-5 tabular-nums no-underline">{time}</span>
      </span>
    </a>
  );
}

/** Pixels per minute in the week's class grid (one hour = 60 px). */
const PX_PER_MIN = 1;

/** A class meeting in the week grid: placed by its time, in a light version of its course's color. Not work. */
function MeetingBlock({ placed, course, from }: { placed: PlacedMeeting; course: Course | undefined; from: number }) {
  const { meeting, top, height, col, cols } = placed;
  const range = timeRange(meeting.startAt, meeting.endAt);
  const label = course ? `${course.code} · ${meeting.title}` : meeting.title;
  return (
    <a
      href={meeting.url}
      target="_blank"
      rel="noopener noreferrer"
      data-kind="meeting"
      title={`${label} · ${range}`}
      className="db-press absolute flex flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-db-text no-underline hover:brightness-95"
      style={{
        top: `${(top - from * 60) * PX_PER_MIN}px`,
        height: `${height * PX_PER_MIN}px`,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
        borderLeftColor: course?.color,
        background: course?.color ? `color-mix(in srgb, ${course.color} 18%, var(--color-db-surface))` : undefined,
      }}
    >
      <span className="truncate caption-4 leading-tight">{label}</span>
      {height >= 36 && <span className="truncate font-mono caption-5 text-db-muted tabular-nums">{range}</span>}
    </a>
  );
}

export function CalendarView({ dashboard, now }: { dashboard: Dashboard; now: Date }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(now);
  const byDay = useMemo(() => itemsByDay(dashboard.items), [dashboard.items]);
  const courseOf = useMemo(() => new Map(dashboard.courses.map((c) => [c.id, c])), [dashboard.courses]);

  const days = mode === 'week' ? weekDays(anchor) : monthCells(anchor);
  const first = days[0]!;
  const last = days[6]!;
  const title = mode === 'week' ? `${format(first, 'MMM d')} – ${format(last, 'MMM d')}` : format(anchor, 'MMMM yyyy');
  const step = (dir: 1 | -1) => setAnchor((a) => (mode === 'week' ? addWeeks(a, dir) : addMonths(a, dir)));
  const rows = mode === 'week' ? [days] : Array.from({ length: 6 }, (_, r) => days.slice(r * 7, r * 7 + 7));
  const meetings = dashboard.meetings ?? [];
  // Week view: work in a "Due" row on top; class meetings below in a time grid (none when the week has no class).
  const hours = mode === 'week' ? weekHours(meetings, days) : null;
  const week = mode === 'week';
  const cols = week ? 'grid grid-cols-[56px_repeat(7,minmax(0,1fr))] gap-px bg-db-border-soft' : 'grid grid-cols-7 gap-px bg-db-border-soft';
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <section className="db-rise overflow-hidden rounded-2xl border border-db-border bg-db-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-db-border-soft px-5 py-4">
        <div className="flex items-center gap-2">
          <button type="button" className={iconBtn} aria-label={t(mode === 'week' ? 'cal.prevWeek' : 'cal.prevMonth')} onClick={() => step(-1)}>
            <CaretLeft aria-hidden="true" size={16} weight="bold" />
          </button>
          <button type="button" className={iconBtn} aria-label={t(mode === 'week' ? 'cal.nextWeek' : 'cal.nextMonth')} onClick={() => step(1)}>
            <CaretRight aria-hidden="true" size={16} weight="bold" />
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setAnchor(now)}>
            {t('cal.today')}
          </button>
          <h2 className="m-0 ml-2 heading-6 tabular-nums">{title}</h2>
        </div>
        <div role="group" aria-label={t('cal.mode')} className="flex gap-1 rounded-xl bg-db-track p-1">
          {(['week', 'month'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`db-press min-h-8 cursor-pointer rounded-lg border-0 px-3 button-sm ${
                mode === m ? 'bg-db-surface text-db-text shadow-sm' : 'bg-transparent text-db-muted hover:text-db-text'
              }`}
            >
              {t(m === 'week' ? 'cal.week' : 'cal.month')}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto p-3 sm:p-4">
        <div role="grid" className="min-w-[980px] overflow-hidden rounded-xl border border-db-border-soft bg-db-border-soft">
          <div role="row" className={cols}>
            {week && <span aria-hidden="true" className="bg-db-subtle" />}
            {WEEKDAY.map((w) => (
              <span key={w} role="columnheader" className="bg-db-subtle px-3 py-2 text-right caption-4 uppercase tracking-wide text-db-faint">
                {w}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={dayKey(row[0]!)} role="row" aria-label={week ? t('cal.due') : undefined} className={cols}>
              {week && <span className="bg-db-subtle px-2 py-3 text-right caption-4 uppercase tracking-wide text-db-faint">{t('cal.due')}</span>}
              {row.map((day) => {
                const list = byDay.get(dayKey(day)) ?? [];
                const shown = mode === 'month' ? list.slice(0, MONTH_LIMIT) : list;
                const isToday = isSameDay(day, now);
                const outside = mode === 'month' && !isSameMonth(day, anchor);
                return (
                  <div
                    key={dayKey(day)}
                    role="gridcell"
                    aria-label={format(day, 'MMM d')}
                    aria-current={isToday ? 'date' : undefined}
                    className={`flex flex-col gap-2 p-2.5 ${week ? (hours ? 'min-h-36' : 'min-h-72') : 'min-h-44'} ${
                      isToday ? 'bg-db-accent-soft' : 'bg-db-surface'
                    } ${outside ? 'opacity-45' : ''}`}
                  >
                    <span
                      className={`ml-auto inline-flex size-7 items-center justify-center rounded-full caption-3 tabular-nums ${
                        isToday ? 'bg-db-accent text-db-on-accent' : 'text-db-muted'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {shown.map((it) => (
                      <Chip key={it.id} item={it} course={courseOf.get(it.courseId)} now={now} />
                    ))}
                    {list.length > shown.length && <span className="px-2 py-1 caption-4 text-db-faint">{t('cal.more', { n: list.length - shown.length })}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {hours && (
            <div role="row" aria-label={t('cal.classes')} className={cols}>
              <div aria-hidden="true" className="relative bg-db-subtle" style={{ height: `${(hours.to - hours.from) * 60 * PX_PER_MIN}px` }}>
                {Array.from({ length: hours.to - hours.from }, (_, i) => (
                  <span key={i} className="absolute right-2 -translate-y-1/2 caption-5 text-db-faint tabular-nums" style={{ top: `${i * 60 * PX_PER_MIN}px` }}>
                    {i === 0 ? '' : format(new Date(2000, 0, 1, hours.from + i), 'h a')}
                  </span>
                ))}
              </div>
              {days.map((day) => {
                const isToday = isSameDay(day, now);
                const showNow = isToday && nowMin >= hours.from * 60 && nowMin <= hours.to * 60;
                return (
                  <div
                    key={dayKey(day)}
                    role="gridcell"
                    aria-label={t('cal.dayClasses', { day: format(day, 'MMM d') })}
                    className={`relative ${isToday ? 'bg-db-accent-soft' : 'bg-db-surface'}`}
                    style={{
                      height: `${(hours.to - hours.from) * 60 * PX_PER_MIN}px`,
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PX_PER_MIN - 1}px, var(--color-db-border-soft) ${60 * PX_PER_MIN - 1}px, var(--color-db-border-soft) ${60 * PX_PER_MIN}px)`,
                    }}
                  >
                    {layoutDay(meetings, day).map((p) => (
                      <MeetingBlock key={p.meeting.id} placed={p} course={courseOf.get(p.meeting.courseId)} from={hours.from} />
                    ))}
                    {showNow && (
                      <span
                        data-testid="now-line"
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 h-0.5 bg-db-urgent-fg"
                        style={{ top: `${(nowMin - hours.from * 60) * PX_PER_MIN}px` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
