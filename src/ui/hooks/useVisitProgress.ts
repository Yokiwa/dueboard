import { useEffect, useState } from 'react';
import { getVisitProgress, onStoreChange, type VisitProgress } from '../../storage/store';

/** "3 of 8" while the background reads platform pages; null otherwise. */
export function useVisitProgress(): VisitProgress | null {
  const [progress, setProgress] = useState<VisitProgress | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getVisitProgress().then((p) => {
        if (alive) setProgress(p);
      });
    void load();
    const off = onStoreChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return progress;
}
