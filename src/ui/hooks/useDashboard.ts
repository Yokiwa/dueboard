import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDashboard, type Dashboard } from '../../core/dashboard';
import type { StoreShape } from '../../core/types';
import { sendToBackground } from '../messaging';
import { useNow } from './useNow';
import { useStore } from './useStore';

export interface DashboardState {
  dashboard: Dashboard | null;
  store: StoreShape | null;
  syncing: boolean;
  refresh(): void;
}

/** Shows cached data immediately, asks the background to sync when stale, and re-renders on every storage change. */
export function useDashboard(): DashboardState {
  const store = useStore();
  const [syncing, setSyncing] = useState(true);
  const now = useNow(60_000);

  useEffect(() => {
    let alive = true;
    sendToBackground({ type: 'syncIfStale' })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSyncing(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setSyncing(true);
    sendToBackground({ type: 'sync' })
      .catch(() => undefined)
      .finally(() => setSyncing(false));
  }, []);

  const dashboard = useMemo(() => (store ? buildDashboard(store, now) : null), [store, now]);
  return { dashboard, store, syncing, refresh };
}
