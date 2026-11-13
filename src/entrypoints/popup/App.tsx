import { useEffect } from 'react';
import { browser } from 'wxt/browser';
import { NextDueBanner } from '../../ui/components/NextDueBanner';
import { ItemRow } from '../../ui/components/ItemRow';
import { DoneToastProvider } from '../../ui/components/DoneToast';
import { useDashboard } from '../../ui/hooks/useDashboard';
import { useNow } from '../../ui/hooks/useNow';
import { useT } from '../../ui/i18n';
import { ArrowRight, Gear } from '@phosphor-icons/react';
import { iconBtn, primaryBtn } from '../../ui/forms';
import { BrandMark } from '../../ui/components/BrandMark';
import type { Dashboard } from '../../core/dashboard';
import type { StoreShape } from '../../core/types';
import { DevTools } from '../../ui/components/DevTools';
import { useVisitProgress } from '../../ui/hooks/useVisitProgress';
import { displayedTheme } from '../../core/theme';

const LIMIT = 5;

function Body({ dashboard, now, store }: { dashboard: Dashboard; now: Date; store: StoreShape }) {
  const t = useT();
  const next = dashboard.nextDue;
  const progress = useVisitProgress();
  const upcoming = dashboard.items.filter((i) => !i.doneByUser && !i.submitted && i.dueAt && i.id !== next?.id && Date.parse(i.dueAt) > now.getTime()).slice(0, LIMIT);
  return (
    <div className="popup-shell flex w-[380px] flex-col gap-4 bg-db-bg p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 title-4 text-db-text">
          <BrandMark className="size-5" />
          DueBoard
        </span>
        <button type="button" onClick={() => void browser.runtime.openOptionsPage()} aria-label={t('settings')} title={t('settings')} className={iconBtn}>
          <Gear aria-hidden="true" size={18} />
        </button>
      </div>
      {progress && <p className="m-0 caption-2 text-db-muted">{t('sync.visiting', { done: progress.done, total: progress.total })}</p>}
      <NextDueBanner item={next} course={dashboard.courses.find((c) => c.id === next?.courseId)} now={now} />
      {upcoming.length > 0 ? (
        <ul className="m-0 list-none rounded-2xl border border-db-border bg-db-surface px-4 py-1 shadow-sm">
          {upcoming.map((i) => (
            <li key={i.id} data-testid="popup-item" className="border-t border-db-border-soft py-3 first:border-t-0">
              <ItemRow item={i} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        !next && <p className="m-0 rounded-2xl border border-db-border bg-db-surface px-4 py-8 text-center body-6 text-db-muted">{t('todo.empty')}</p>
      )}
      <button type="button" className={primaryBtn} onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') })}>
        {t('popup.open')}
        <ArrowRight aria-hidden="true" size={16} weight="bold" />
      </button>
      <DevTools store={store} />
    </div>
  );
}

export function PopupApp() {
  const { dashboard, store } = useDashboard();
  const now = useNow(1000);
  const selectedTheme = store?.settings.theme ?? 'automatic';
  const activeTheme = displayedTheme(selectedTheme, now);
  useEffect(() => {
    document.body.dataset.theme = activeTheme;
    document.body.dataset.themeMode = selectedTheme;
  }, [activeTheme, selectedTheme]);
  if (!store || !dashboard) return null;
  return (
    <DoneToastProvider>
      <Body dashboard={dashboard} now={now} store={store} />
    </DoneToastProvider>
  );
}
