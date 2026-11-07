import { ArrowUpRight } from '@phosphor-icons/react';
import { formatCountdown, formatDueAt } from '../../core/time';
import type { Course, Item } from '../../core/types';
import { primaryBtn, secondaryBtn } from '../forms';
import { useLang, useT } from '../i18n';
import { sourceLabel } from '../sourceLabel';
import { useMarkDone } from './DoneToast';

export interface NextDueBannerProps {
  item: Item | null;
  course: Course | undefined;
  now: Date;
}

export function NextDueBanner({ item, course, now }: NextDueBannerProps) {
  const lang = useLang();
  const t = useT();
  const markDone = useMarkDone();
  if (!item?.dueAt) return null;
  const due = new Date(item.dueAt);
  return (
    <section
      aria-label={t('banner.label')}
      className="db-rise flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-db-banner-border bg-db-banner-bg p-6 shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <span className="flex items-center gap-2 caption-3 tracking-wide text-db-banner-label">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-current" />
          </span>
          {t('banner.label')}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {course && <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: course.color }} />}
          <span className="heading-6 text-db-text">{course ? `${course.code} · ${item.title}` : item.title}</span>
        </span>
        <span className="caption-2 text-db-banner-sub">{`${sourceLabel(item, t)} · ${formatDueAt(due, now, lang)}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <span className="font-mono heading-4 tracking-tight text-db-countdown tabular-nums sm:heading-3" role="timer">
          {formatCountdown(due, now, lang)}
        </span>
        <div className="flex gap-2">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
            {t('banner.submit')}
            <ArrowUpRight aria-hidden="true" size={16} weight="bold" />
          </a>
          <button type="button" aria-label={t('done.mark', { title: item.title })} onClick={() => void markDone(item)} className={secondaryBtn}>
            {t('banner.done')}
          </button>
        </div>
      </div>
    </section>
  );
}
