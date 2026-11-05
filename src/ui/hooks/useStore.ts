import { useEffect, useState } from 'react';
import type { StoreShape } from '../../core/types';
import { loadStore, onStoreChange } from '../../storage/store';

/** Local DueBoard data, kept current with every storage change. null until the first read finishes. */
export function useStore(): StoreShape | null {
  const [store, setStore] = useState<StoreShape | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadStore().then((s) => {
        if (alive) setStore(s);
      });
    void load();
    const off = onStoreChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return store;
}
