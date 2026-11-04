import { format } from 'date-fns';
import { useLang, useT } from '../i18n';

const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export interface HeaderProps {
  now: Date;
  pendingWeek: number;
  lastSynced: string | null;
  syncing: boolean;
  onRefresh(): void;
}

function greetingKey(now: Date) {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'greeting.morning' as const;
  if (h >= 12 && h < 18) return 'greeting.afternoon' as const;
  return 'greeting.evening' as const;
}

export function Header({ now, pendingWeek, lastSynced, syncing, onRefresh }: HeaderProps) {
  const lang = useLang();
  const t = useT();
  const date = lang === 'zh' ? `${format(now, 'M月d日')} ${WEEKDAYS_ZH[now.getDay()]}` : format(now, 'EEEE, MMMM d');
  const greet = t(greetingKey(now));
  const title = pendingWeek > 0 ? t('header.pendingWeek', { greet, n: pendingWeek }) : t('header.noneWeek', { greet });
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-db-muted">{date}</span>
        <h1 className="m-0 text-[28px] font-bold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-db-muted">{lastSynced ? t('sync.synced', { ago: t('ago', { iso: lastSynced, now }) }) : t('sync.never')}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="min-h-11 cursor-pointer rounded-[10px] border border-db-border bg-db-surface px-4 text-sm font-medium text-db-text disabled:cursor-default disabled:text-db-faint"
        >
          {syncing ? t('sync.syncing') : t('refresh')}
        </button>
      </div>
    </header>
  );
}
