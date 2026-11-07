import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import type { Item } from '../../core/types';
import { toggleDone } from '../../storage/store';
import { useT } from '../i18n';

const TOAST_MS = 5000;

type MarkDone = (item: Item) => Promise<void>;
// Without a provider (e.g. in isolation) marking done still works, just without the undo toast.
const DoneContext = createContext<MarkDone>((item) => toggleDone(item.sourceKeys, true));

/** Marks an item done (all its merged sources) and shows "Marked done: … · Undo" for 5 seconds. */
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
          className="db-rise fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-xl bg-db-ink py-2 pr-2 pl-4 body-6 text-db-on-ink shadow-lg"
        >
          <CheckCircle aria-hidden="true" size={18} weight="fill" className="shrink-0" />
          <span className="truncate">{t('toast.done', { title: last.title })}</span>
          <button
            type="button"
            onClick={undo}
            className="db-press min-h-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent px-3 button-sm text-db-on-ink underline underline-offset-4 hover:opacity-70"
          >
            {t('toast.undo')}
          </button>
        </div>
      )}
    </DoneContext.Provider>
  );
}
