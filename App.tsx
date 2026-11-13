import { browser } from 'wxt/browser';
import { dueCounts } from '../../core/dashboard';
import { DoneToastProvider } from '../../ui/components/DoneToast';
import { Onboarding } from '../../ui/components/Onboarding';
import { AppShell } from '../../ui/components/AppShell';
import { Header } from '../../ui/components/Header';
import { NextDueBanner } from '../../ui/components/NextDueBanner';
import { PomodoroTimer } from '../../ui/components/PomodoroTimer';
import { SourceBanners } from '../../ui/components/SourceBanners';
import { PlatformAccess } from '../../ui/components/PermissionBanner';
import { SiteAccessBanner } from '../../ui/components/SiteAccessBanner';
import { useGranted } from '../../ui/hooks/useGranted';
import { useVisitProgress } from '../../ui/hooks/useVisitProgress';
import { StatChips } from '../../ui/components/StatChips';
import { ViewTabs, type View } from '../../ui/components/ViewTabs';
import { useDashboard } from '../../ui/hooks/useDashboard';
import { useNow } from '../../ui/hooks/useNow';
import { useView } from '../../ui/hooks/useView';
import { CoursesView } from '../../ui/views/CoursesView';
import { CalendarView } from '../../ui/views/CalendarView';
import { TodoView } from '../../ui/views/TodoView';
import type { Dashboard } from '../../core/dashboard';
import { syllabusSuggestions, unreadableSyllabi } from '../../core/syllabusSuggestions';
import type { SyllabusView } from '../../ui/components/SyllabusSuggestions';
import type { CompletedPlacement, StoreShape } from '../../core/types';

/** Oldest successful sync across platforms that have synced at least once. */
export function lastSynced(store: StoreShape): string | null {
  const times = Object.values(store.syncMeta)
    .map((m) => m?.lastSuccess)
    .filter((x): x is string => Boolean(x))
    .sort();
  return times[0] ?? null;
}

function ViewBody({ view, dashboard, now, syllabus, completed }: { view: View; dashboard: Dashboard; now: Date; syllabus: SyllabusView; completed: CompletedPlacement }) {
  if (view === 'courses') return <CoursesView dashboard={dashboard} now={now} syllabus={syllabus} completed={completed} />;
  if (view === 'calendar') return <CalendarView dashboard={dashboard} now={now} />;
  return <TodoView dashboard={dashboard} now={now} syllabus={syllabus} />;
}

export function App() {
  const { dashboard, store, syncing, refresh } = useDashboard();
  const now = useNow(1000);
  const [view, setView] = useView();
  const granted = useGranted();
  const progress = useVisitProgress();
  if (!store || !dashboard) return null;
  if (Object.keys(store.snapshots).length === 0) {
    return (
      <Onboarding />
    );
  }

  const counts = dueCounts(dashboard.items, now);
  const nextCourse = dashboard.courses.find((c) => c.id === dashboard.nextDue?.courseId);
  return (
    <DoneToastProvider>
        <AppShell nav={<ViewTabs view={view} onChange={setView} />}>
          <Header now={now} pendingWeek={counts.week} lastSynced={lastSynced(store)} syncing={syncing} progress={progress} onRefresh={refresh} onSettings={() => void browser.runtime.openOptionsPage()}>
            <StatChips within48={counts.within48} week={counts.week} />
          </Header>
          {granted && <SiteAccessBanner granted={granted} />}
          <SourceBanners store={store} now={now} busy={syncing || progress !== null} />
          {granted && <PlatformAccess store={store} granted={granted} now={now} />}
          <NextDueBanner item={dashboard.nextDue} course={nextCourse} now={now} />
          <PomodoroTimer now={now} />
          <ViewBody
            key={view}
            view={view}
            dashboard={dashboard}
            now={now}
            syllabus={{ suggestions: syllabusSuggestions(store, dashboard, now), unreadable: unreadableSyllabi(store, dashboard) }}
            completed={store.settings.completed}
          />
        </AppShell>
    </DoneToastProvider>
  );
}
