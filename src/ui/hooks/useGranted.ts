import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

/** The site access this extension currently has (permissions.getAll().origins); null until known. */
export function useGranted(): string[] | null {
  const [granted, setGranted] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.resolve()
        .then(() => browser.permissions.getAll())
        .then((p) => {
          if (alive) setGranted(p.origins ?? []);
        })
        .catch(() => undefined);
    void load();
    // Some environments (older browsers, test stubs) lack these events; access then refreshes on the next page load.
    const events = [browser.permissions?.onAdded, browser.permissions?.onRemoved].filter((e) => {
      try {
        e?.addListener(load);
        return Boolean(e);
      } catch {
        return false;
      }
    });
    return () => {
      alive = false;
      for (const e of events) {
        try {
          e!.removeListener(load);
        } catch {
          // ignore
        }
      }
    };
  }, []);
  return granted;
}
