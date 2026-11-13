import { useEffect } from 'react';
import { browser } from 'wxt/browser';
import { dueCounts } from '../../core/dashboard';
import { DoneToastProvider } from '../../ui/components/DoneToast';
import { Onboarding } from '../../ui/components/Onboarding';
import { AppShell } from '../../ui/components/AppShell';
import { Header } from '../../ui/components/Header';
import { NextDueBanner } from '../../ui/components/NextDueBanner';
import { PomodoroTimer } from '../../ui/components/PomodoroTimer';
import { MusicPlayer } from '../../ui/components/MusicPlayer';
import { SourceBanners } from '../../ui/components/SourceBanners';
import { PlatformAccess } from '../../ui/components/PermissionBanner';
import { SiteAccessBanner } from '../../ui/components/SiteAccessBanner';
import { useGranted } from '../../ui/hooks/useGranted';
import { useVisitProgress } from '../../ui/hooks/useVisitProgress';
import { StatChips } from '../../ui/components/StatChips';
import { ThemeSwitcher } from '../../ui/components/ThemeSwitcher';
import { ViewTabs, type View } from '../../ui/components/ViewTabs';
import { useDashboard } from '../../ui/hooks/useDashboard';
import { useNow } from '../../ui/hooks/useNow';
import { useView } from '../../ui/hooks/useView';
import { useT, type MessageKey } from '../../ui/i18n';
import { CoursesView } from '../../ui/views/CoursesView';
import { CalendarView } from '../../ui/views/CalendarView';
import { TodoView } from '../../ui/views/TodoView';
import type { Dashboard } from '../../core/dashboard';
import { syllabusSuggestions, unreadableSyllabi } from '../../core/syllabusSuggestions';
import type { SyllabusView } from '../../ui/components/SyllabusSuggestions';
import type { CompletedPlacement, StoreShape } from '../../core/types';
import { saveSettings } from '../../storage/store';
import { displayedTheme } from '../../core/theme';

const VIEW_LABEL: Record<View, MessageKey> = {
  courses: 'tabs.courses',
  calendar: 'tabs.calendar',
  todo: 'tabs.todo',
  timer: 'tabs.timer',
  music: 'tabs.music',
};

/** Oldest successful sync across platforms that have synced at least once. */
export function lastSynced(store: StoreShape): string | null {
  const times = Object.values(store.syncMeta)
    .map((m) => m?.lastSuccess)
    .filter((x): x is string => Boolean(x))
    .sort();
  return times[0] ?? null;
}

function ViewBody({ view, dashboard, now, syllabus, completed }: { view: View; dashboard: Dashboard; now: Date; syllabus: SyllabusView; completed: CompletedPlacement }) {
  if (view === 'music') return <MusicPlayer />;
  if (view === 'timer') return <PomodoroTimer now={now} />;
  if (view === 'courses') return <CoursesView dashboard={dashboard} now={now} syllabus={syllabus} completed={completed} />;
  if (view === 'calendar') return <CalendarView dashboard={dashboard} now={now} />;
  return <TodoView dashboard={dashboard} now={now} syllabus={syllabus} />;
}

export function App() {
  const t = useT();
  const { dashboard, store, syncing, refresh } = useDashboard();
  const now = useNow(1000);
  const [view, setView] = useView();
  const granted = useGranted();
  const progress = useVisitProgress();
  const selectedTheme = store?.settings.theme ?? 'automatic';
  const activeTheme = displayedTheme(selectedTheme, now);
  useEffect(() => {
    const applyTheme = () => {
      document.body.dataset.theme = activeTheme;
      document.body.dataset.themeMode = selectedTheme;
    };
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
    };
    if (document.body.dataset.theme && document.body.dataset.theme !== activeTheme && transitionDocument.startViewTransition) {
      document.documentElement.classList.add('theme-transitioning');
      const transition = transitionDocument.startViewTransition(applyTheme);
      void transition.finished.finally(() => document.documentElement.classList.remove('theme-transitioning'));
    } else {
      applyTheme();
    }
  }, [activeTheme, selectedTheme]);
  if (!store || !dashboard) return null;
  if (Object.keys(store.snapshots).length === 0) {
    return <Onboarding />;
  }

  const counts = dueCounts(dashboard.items, now);
  const nextCourse = dashboard.courses.find((c) => c.id === dashboard.nextDue?.courseId);
  const changeView = (next: View) => {
    if (next === view) return;
    const transitionDocument = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(() => setView(next));
      return;
    }
    setView(next);
  };
  return (
    <DoneToastProvider>
      <AppShell nav={<ViewTabs view={view} onChange={changeView} />}>
        <Header now={now} pendingWeek={counts.week} lastSynced={lastSynced(store)} syncing={syncing} progress={progress} onRefresh={refresh} onSettings={() => window.location.assign(browser.runtime.getURL('/options.html'))}>
          <div className="dashboard-header-tools">
            <StatChips within48={counts.within48} week={counts.week} />
            <ThemeSwitcher theme={store.settings.theme} onChange={(theme) => void saveSettings({ theme })} />
          </div>
        </Header>
        {granted && <SiteAccessBanner granted={granted} />}
        <SourceBanners store={store} now={now} busy={syncing || progress !== null} />
        {granted && <PlatformAccess store={store} granted={granted} now={now} />}
        <div className="dashboard-priority" data-has-deadline={Boolean(dashboard.nextDue)}>
          <NextDueBanner item={dashboard.nextDue} course={nextCourse} now={now} />
        </div>
        <section aria-labelledby="dashboard-view-heading" className="dashboard-view">
          <h2 id="dashboard-view-heading" className="dashboard-view-heading">{t(VIEW_LABEL[view])}</h2>
          <div key={view} className="dashboard-view-content" data-view={view}>
            <ViewBody
              view={view}
              dashboard={dashboard}
              now={now}
              syllabus={{ suggestions: syllabusSuggestions(store, dashboard, now), unreadable: unreadableSyllabi(store, dashboard) }}
              completed={store.settings.completed}
            />
          </div>
        </section>
      </AppShell>
    </DoneToastProvider>
  );
}
