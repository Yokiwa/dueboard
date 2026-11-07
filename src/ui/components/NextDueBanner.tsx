import { ArrowUpRight, Check } from '@phosphor-icons/react';
import { formatCountdown, formatDueAt, urgency } from '../../core/time';
import type { Course, Item } from '../../core/types';
import { useLang, useT } from '../i18n';
import { sourceLabel } from '../sourceLabel';
import { useMarkDone } from './DoneToast';

const DAY_MS = 86_400_000;
const COUNTDOWN_TONE = {
  overdue: 'text-db-countdown',
  urgent: 'text-db-countdown',
  soon: 'text-db-countdown-soon',
  normal: 'text-db-countdown-normal',
} as const;

const btnBase =
  'db-press inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 button-sm no-underline focus-visible:outline-db-banner-fg';

export interface NextDueBannerProps {
  item: Item | null;
  course: Course | undefined;
  now: Date;
}

/** The one dark feature card on the page: the next deadline, its countdown and the two actions. */
export function NextDueBanner({ item, course, now }: NextDueBannerProps) {
  const lang = useLang();
  const t = useT();
  const markDone = useMarkDone();
  if (!item?.dueAt) return null;
  const due = new Date(item.dueAt);
  const tone = urgency(due, now);
  // The live pulse only runs inside the final day, so an always open new tab is not constantly blinking.
  const live = due.getTime() - now.getTime() < DAY_MS;
  return (
    <section
      aria-label={t('banner.label')}
      className="db-rise flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-db-banner-border bg-db-banner-bg p-6 text-db-banner-fg shadow-lg"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <span className={`flex items-center gap-2 caption-3 tracking-wide ${COUNTDOWN_TONE[tone]}`}>
          <span aria-hidden="true" className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />}
            <span className="relative inline-flex size-2 rounded-full bg-current" />
          </span>
          {t('banner.label')}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {course && <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: course.color }} />}
          <span className="heading-6">{course ? `${course.code} · ${item.title}` : item.title}</span>
        </span>
        <span className="caption-2 text-db-banner-sub">{`${sourceLabel(item, t)} · ${formatDueAt(due, now, lang)}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <span className={`font-mono heading-4 tracking-tight tabular-nums sm:heading-3 ${COUNTDOWN_TONE[tone]}`} role="timer">
          {formatCountdown(due, now, lang)}
        </span>
        <div className="flex gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btnBase} border-0 bg-db-banner-fg text-db-banner-bg hover:opacity-90`}
          >
            {t('banner.submit')}
            <ArrowUpRight aria-hidden="true" size={16} weight="bold" />
          </a>
          <button
            type="button"
            aria-label={t('done.mark', { title: item.title })}
            onClick={() => void markDone(item)}
            className={`${btnBase} border border-db-banner-line bg-transparent text-db-banner-fg hover:bg-db-banner-hover`}
          >
            <Check aria-hidden="true" size={16} weight="bold" />
            {t('banner.done')}
          </button>
        </div>
      </div>
    </section>
  );
}
