import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Item } from '../../core/types';
import { toggleDone } from '../../storage/store';
import { useT } from '../i18n';

const TOAST_MS = 5000;

type MarkDone = (item: Item) => Promise<void>;
// Without a provider (e.g. in isolation) marking done still works, just without the undo toast.
const DoneContext = createContext<MarkDone>((item) => toggleDone(item.sourceKeys, true));

/** Marks an item done (all its merged sources) and shows "已标记完成 · 撤销" for 5 seconds. */
export const useMarkDone = () => useContext(DoneContext);

export function DoneToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [last, setLast] = useState<Item | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const markDone = useCallback<MarkDone>(async (item) => {
    await toggleDone(item.sourceKeys, true);
    setLast(item);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLast(null), TOAST_MS);
  }, []);

  const undo = () => {
    if (!last) return;
    clearTimeout(timer.current);
    void toggleDone(last.sourceKeys, false);
    setLast(null);
  };

  return (
    <DoneContext.Provider value={markDone}>
      {children}
      {last && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 rounded-xl bg-db-ink px-4 py-3 text-sm text-db-on-ink shadow-lg"
        >
          <span className="truncate">{t('toast.done', { title: last.title })}</span>
          <button type="button" onClick={undo} className="min-h-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent px-2 font-semibold text-db-on-ink underline">
            {t('toast.undo')}
          </button>
        </div>
      )}
    </DoneContext.Provider>
  );
}
