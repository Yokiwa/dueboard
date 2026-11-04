import { SOURCES, type SourceId, type StoreShape } from '../../core/types';
import { useT } from '../i18n';

const NAMES: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope' };
export const LOGIN_URLS: Record<SourceId, string> = {
  brightspace: 'https://purdue.brightspace.com/d2l/login',
  gradescope: 'https://www.gradescope.com/login',
};

/** One line per platform whose most recent sync attempt failed. */
export function SourceBanners({ store, now }: { store: StoreShape; now: Date }) {
  const t = useT();
  const rows = SOURCES.flatMap((src) => {
    const meta = store.syncMeta[src];
    const err = meta?.lastError;
    if (!err) return [];
    if (meta.lastSuccess && Date.parse(meta.lastSuccess) >= Date.parse(err.at)) return [];
    const name = NAMES[src];
    if (err.reason === 'not_logged_in') {
      return [
        <div key={src} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg px-4 py-3">
          <span className="text-sm font-medium text-db-urgent-fg">{t('source.relogin', { name })}</span>
          <button
            type="button"
            onClick={() => window.open(LOGIN_URLS[src], '_blank', 'noopener')}
            className="min-h-10 cursor-pointer rounded-lg border-0 bg-db-ink px-4 text-sm font-semibold text-db-on-ink"
          >
            {t('source.loginButton')}
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
