import { useMemo, useState } from 'react';
import { addMonths, addWeeks, format, isSameDay, isSameMonth } from 'date-fns';
import type { Dashboard } from '../../core/dashboard';
import type { Course, Item } from '../../core/types';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { iconBtn, secondaryBtn } from '../forms';
import { useLang, useT } from '../i18n';
import { dayKey, itemsByDay, monthCells, weekDays } from './calendarGrid';

type Mode = 'week' | 'month';
const WEEKDAY = { zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MONTH_LIMIT = 3;

function Chip({ item, course, lang }: { item: Item; course: Course | undefined; lang: 'zh' | 'en' }) {
  const done = item.doneByUser || item.submitted;
  const time = format(new Date(item.dueAt!), lang === 'zh' ? 'HH:mm' : 'h:mm a');
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-done={String(done)}
      title={course ? `${course.code} · ${item.title}` : item.title}
      className={`db-press flex min-w-0 items-center gap-1 rounded-md bg-db-subtle px-2 py-1 caption-4 hover:bg-db-hover ${
        done ? 'text-db-faint line-through' : 'text-db-text no-underline'
      }`}
    >
      <span data-testid="chip-dot" aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: course?.color }} />
      <span className="shrink-0 font-mono caption-5 text-db-faint tabular-nums">{time}</span>
      <span className="truncate">{item.title}</span>
    </a>
  );
}

export function CalendarView({ dashboard, now }: { dashboard: Dashboard; now: Date }) {
  const lang = useLang();
  const t = useT();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(now);
  const byDay = useMemo(() => itemsByDay(dashboard.items), [dashboard.items]);
  const courseOf = useMemo(() => new Map(dashboard.courses.map((c) => [c.id, c])), [dashboard.courses]);

  const days = mode === 'week' ? weekDays(anchor) : monthCells(anchor);
  const first = days[0]!;
  const last = days[6]!;
  const title =
    mode === 'week'
      ? lang === 'zh'
        ? `${format(first, 'M月d日')} – ${format(last, 'M月d日')}`
        : `${format(first, 'MMM d')} – ${format(last, 'MMM d')}`
      : lang === 'zh'
        ? format(anchor, 'yyyy年M月')
        : format(anchor, 'MMMM yyyy');
  const step = (dir: 1 | -1) => setAnchor((a) => (mode === 'week' ? addWeeks(a, dir) : addMonths(a, dir)));
  const rows = mode === 'week' ? [days] : Array.from({ length: 6 }, (_, r) => days.slice(r * 7, r * 7 + 7));

  return (
    <section className="db-rise flex flex-col gap-4 rounded-2xl border border-db-border bg-db-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <div className="overflow-x-auto">
        <div role="grid" className="min-w-[700px]">
          <div role="row" className="grid grid-cols-7 gap-1 pb-2">
            {WEEKDAY[lang].map((w) => (
              <span key={w} role="columnheader" className="px-2 caption-3 text-db-faint">
                {w}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={dayKey(row[0]!)} role="row" className="grid grid-cols-7 gap-1">
              {row.map((day) => {
                const list = byDay.get(dayKey(day)) ?? [];
                const shown = mode === 'month' ? list.slice(0, MONTH_LIMIT) : list;
                const isToday = isSameDay(day, now);
                const outside = mode === 'month' && !isSameMonth(day, anchor);
                return (
                  <div
                    key={dayKey(day)}
                    role="gridcell"
                    aria-label={lang === 'zh' ? format(day, 'M月d日') : format(day, 'MMM d')}
                    aria-current={isToday ? 'date' : undefined}
                    className={`flex flex-col gap-1 rounded-xl border p-2 ${mode === 'week' ? 'min-h-48' : 'min-h-24'} ${
                      isToday ? 'border-db-accent bg-db-accent-soft' : 'border-db-border-soft'
                    } ${outside ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full caption-3 tabular-nums ${
                        isToday ? 'bg-db-accent text-db-on-accent' : 'text-db-muted'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {shown.map((it) => (
                      <Chip key={it.id} item={it} course={courseOf.get(it.courseId)} lang={lang} />
                    ))}
                    {list.length > shown.length && <span className="px-2 caption-4 text-db-faint">{`+${list.length - shown.length}`}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
