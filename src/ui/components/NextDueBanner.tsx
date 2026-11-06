import { formatCountdown, formatDueAt } from '../../core/time';
import type { Course, Item } from '../../core/types';
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
      className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-db-banner-border bg-db-banner-bg px-6 py-5"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-bold tracking-[0.08em] text-db-banner-label">{t('banner.label')}</span>
        <span className="text-[21px] font-bold">{course ? `${course.code} · ${item.title}` : item.title}</span>
        <span className="text-[13px] text-db-banner-sub">{`${sourceLabel(item, t)} · ${formatDueAt(due, now, lang)}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <span className="font-mono text-[38px] font-bold text-db-countdown tabular-nums" role="timer">
          {formatCountdown(due, now, lang)}
        </span>
        <div className="flex gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[10px] bg-db-ink px-[18px] py-3 text-sm font-semibold text-db-on-ink no-underline"
          >
            {t('banner.submit')}
          </a>
          <button
            type="button"
            aria-label={t('done.mark', { title: item.title })}
            onClick={() => void markDone(item)}
            className="min-h-11 cursor-pointer rounded-[10px] border border-db-banner-border bg-db-surface px-4 text-sm font-semibold text-db-text"
          >
            {t('banner.done')}
          </button>
        </div>
      </div>
    </section>
  );
}
