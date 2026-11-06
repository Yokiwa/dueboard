import { ALL_SOURCES, type SourceId, type StoreShape } from '../../core/types';
import { useT } from '../i18n';

const NAMES: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope', pearson: 'Pearson' };
export const LOGIN_URLS: Record<SourceId, string> = {
  brightspace: 'https://purdue.brightspace.com/d2l/login',
  gradescope: 'https://www.gradescope.com/login',
  pearson: 'https://purdue.brightspace.com/d2l/home',
};
/** Platforms reached through a Brightspace launch: re-opening that launch renews their session. */
const LAUNCHED: SourceId[] = ['pearson'];

/** One line per platform whose most recent sync attempt failed. */
export function SourceBanners({ store, now, launchUrls = {} }: { store: StoreShape; now: Date; launchUrls?: Partial<Record<SourceId, string>> }) {
  const t = useT();
  const rows = ALL_SOURCES.flatMap((src) => {
    const meta = store.syncMeta[src];
    const err = meta?.lastError;
    if (!err) return [];
    if (meta.lastSuccess && Date.parse(meta.lastSuccess) >= Date.parse(err.at)) return [];
    const name = NAMES[src];
    if (err.reason === 'not_logged_in') {
      const launched = LAUNCHED.includes(src);
      const target = (launched && launchUrls[src]) || LOGIN_URLS[src];
      return [
        <div key={src} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg px-4 py-3">
          <span className="text-sm font-medium text-db-urgent-fg">{launched ? t('source.reopen', { name }) : t('source.relogin', { name })}</span>
          <button
            type="button"
            onClick={() => window.open(target, '_blank', 'noopener')}
            className="min-h-10 cursor-pointer rounded-lg border-0 bg-db-ink px-4 text-sm font-semibold text-db-on-ink"
          >
            {launched ? t('source.openPlatform', { name }) : t('source.loginButton')}
          </button>
        </div>,
      ];
    }
    const snap = store.snapshots[src];
    const text = snap ? t('source.stale', { name, ago: t('ago', { iso: snap.syncedAt, now }) }) : t('source.failed', { name });
    return [
      <div key={src} role="status" className="rounded-xl border border-db-border bg-db-surface px-4 py-3 text-sm text-db-muted">
        {text}
      </div>,
    ];
  });
  if (rows.length === 0) return null;
  return <div className="flex flex-col gap-2">{rows}</div>;
}
