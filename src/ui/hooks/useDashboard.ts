import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDashboard, type Dashboard } from '../../core/dashboard';
import type { StoreShape } from '../../core/types';
import { loadStore, onStoreChange } from '../../storage/store';
import { sendToBackground } from '../messaging';
import { useNow } from './useNow';

export interface DashboardState {
  dashboard: Dashboard | null;
  store: StoreShape | null;
  syncing: boolean;
  refresh(): void;
}

/** Shows cached data immediately, asks the background to sync when stale, and re-renders on every storage change. */
export function useDashboard(): DashboardState {
  const [store, setStore] = useState<StoreShape | null>(null);
  const [syncing, setSyncing] = useState(true);
  const now = useNow(60_000);

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadStore().then((s) => {
        if (alive) setStore(s);
      });
    void load();
    const off = onStoreChange(() => void load());
    sendToBackground({ type: 'syncIfStale' })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSyncing(false);
      });
    return () => {
      alive = false;
      off();
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
