import { dueCounts } from '../../core/dashboard';
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
import { LangProvider, resolveLang } from '../../ui/i18n';
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
  const lang = resolveLang(store?.settings.language ?? 'auto', navigator.language);
  if (!store || !dashboard) return null;

  const counts = dueCounts(dashboard.items, now);
  const nextCourse = dashboard.courses.find((c) => c.id === dashboard.nextDue?.courseId);
  return (
    <LangProvider lang={lang}>
      <AppShell>
        <Header now={now} pendingWeek={counts.week} lastSynced={lastSynced(store)} syncing={syncing} onRefresh={refresh} />
        <SourceBanners store={store} now={now} />
        <NextDueBanner item={dashboard.nextDue} course={nextCourse} now={now} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ViewTabs view={view} onChange={setView} />
          <StatChips within48={counts.within48} week={counts.week} />
        </div>
        <ViewBody view={view} dashboard={dashboard} now={now} />
      </AppShell>
    </LangProvider>
  );
}
