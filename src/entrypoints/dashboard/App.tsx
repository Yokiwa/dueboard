import { dueCounts } from '../../core/dashboard';
import { DoneToastProvider } from '../../ui/components/DoneToast';
import { Onboarding } from '../../ui/components/Onboarding';
import { AppShell } from '../../ui/components/AppShell';
import { Header } from '../../ui/components/Header';
import { NextDueBanner } from '../../ui/components/NextDueBanner';
import { SourceBanners } from '../../ui/components/SourceBanners';
import { StatChips } from '../../ui/components/StatChips';
import { ViewTabs, type View } from '../../ui/components/ViewTabs';
import { useDashboard } from '../../ui/hooks/useDashboard';
import { useNow } from '../../ui/hooks/useNow';
import { useView } from '../../ui/hooks/useView';
import { CoursesView } from '../../ui/views/CoursesView';
import { CalendarView } from '../../ui/views/CalendarView';
import { TodoView } from '../../ui/views/TodoView';
import type { Dashboard } from '../../core/dashboard';
import type { StoreShape } from '../../core/types';

/** Oldest successful sync across platforms that have synced at least once. */
export function lastSynced(store: StoreShape): string | null {
  const times = Object.values(store.syncMeta)
    .map((m) => m?.lastSuccess)
    .filter((x): x is string => Boolean(x))
    .sort();
  return times[0] ?? null;
}

function ViewBody({ view, dashboard, now }: { view: View; dashboard: Dashboard; now: Date }) {
  if (view === 'courses') return <CoursesView dashboard={dashboard} now={now} />;
  if (view === 'calendar') return <CalendarView dashboard={dashboard} now={now} />;
  return <TodoView dashboard={dashboard} now={now} />;
}

export function App() {
  const { dashboard, store, syncing, refresh } = useDashboard();
  const now = useNow(1000);
  const [view, setView] = useView();
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
          <Header now={now} pendingWeek={counts.week} lastSynced={lastSynced(store)} syncing={syncing} onRefresh={refresh}>
            <StatChips within48={counts.within48} week={counts.week} />
          </Header>
          <SourceBanners store={store} now={now} launchUrls={{ pearson: dashboard.links.find((l) => l.label === 'Pearson')?.url }} />
          <NextDueBanner item={dashboard.nextDue} course={nextCourse} now={now} />
          <ViewBody key={view} view={view} dashboard={dashboard} now={now} />
        </AppShell>
    </DoneToastProvider>
  );
}
