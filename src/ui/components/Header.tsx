import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { ArrowClockwise } from '@phosphor-icons/react';
import { secondaryBtn } from '../forms';
import { useT } from '../i18n';


export interface HeaderProps {
  now: Date;
  pendingWeek: number;
  lastSynced: string | null;
  syncing: boolean;
  /** While platform pages are read after a sync. */
  progress?: { done: number; total: number } | null;
  onRefresh(): void;
  /** Optional row under the heading (the dashboard puts the stat chips here). */
  children?: ReactNode;
}

function greetingKey(now: Date) {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'greeting.morning' as const;
  if (h >= 12 && h < 18) return 'greeting.afternoon' as const;
  return 'greeting.evening' as const;
}

export function Header({ now, pendingWeek, lastSynced, syncing, progress, onRefresh, children }: HeaderProps) {
  const t = useT();
  const date = format(now, 'EEEE, MMMM d');
  const greet = t(greetingKey(now));
  const title = pendingWeek > 0 ? t('header.pendingWeek', { greet, n: pendingWeek }) : t('header.noneWeek', { greet });
  return (
    <header className="db-rise flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 max-w-[680px] flex-col gap-3">
        <span className="body-5 text-db-muted">{date}</span>
        <h1 className="m-0 heading-4 tracking-tight sm:heading-3">
          <span className="hero-text">{title}</span>
        </h1>
        {children}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 caption-2 text-db-muted">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${syncing || progress ? 'animate-pulse bg-db-accent' : lastSynced ? 'bg-db-ok' : 'bg-db-faint'}`}
          />
          {progress
            ? t('sync.visiting', { done: progress.done, total: progress.total })
            : lastSynced
              ? t('sync.synced', { ago: t('ago', { iso: lastSynced, now }) })
              : t('sync.never')}
        </span>
        <button type="button" onClick={onRefresh} disabled={syncing} className={secondaryBtn}>
          <ArrowClockwise aria-hidden="true" size={16} weight="bold" />
          {syncing ? t('sync.syncing') : t('refresh')}
        </button>
      </div>
    </header>
  );
}
