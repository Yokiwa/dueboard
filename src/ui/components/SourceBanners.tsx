import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';
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

/**
 * One compact line per platform whose most recent sync attempt failed.
 * Sign-in problems need an action, so they get a tinted pill with a button; other failures are a quiet status line.
 */
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
        <div
          key={src}
          role="alert"
          className="db-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg py-1 pr-1 pl-3"
        >
          <span className="flex items-center gap-2 body-5 text-db-urgent-fg">
            <WarningCircle aria-hidden="true" size={16} weight="fill" className="shrink-0" />
            {launched ? t('source.reopen', { name }) : t('source.relogin', { name })}
          </span>
          <button
            type="button"
            onClick={() => window.open(target, '_blank', 'noopener')}
            className="db-press inline-flex min-h-8 cursor-pointer items-center rounded-lg border-0 bg-db-urgent-fg px-3 py-1 button-xsm text-db-surface hover:opacity-90"
          >
            {launched ? t('source.openPlatform', { name }) : t('source.loginButton')}
          </button>
        </div>,
      ];
    }
    const snap = store.snapshots[src];
    const text = snap ? t('source.stale', { name, ago: t('ago', { iso: snap.syncedAt, now }) }) : t('source.failed', { name });
    return [
      <div key={src} role="status">
        <details className="group caption-2 text-db-muted">
        <summary className="db-press inline-flex cursor-pointer list-none items-center gap-2 rounded-sm hover:text-db-text [&::-webkit-details-marker]:hidden">
          <ArrowsClockwise aria-hidden="true" size={14} className="shrink-0 text-db-faint" />
          <span>{text}</span>
          <span className="caption-5 text-db-faint underline underline-offset-4 group-open:no-underline">{t('source.details')}</span>
        </summary>
        <code className="mt-2 block rounded-md bg-db-subtle p-2 font-mono caption-5 break-all whitespace-pre-wrap text-db-faint">
          {`${err.reason}${err.detail ? ` — ${err.detail}` : ''} (${t('ago', { iso: err.at, now })})`}
        </code>
        </details>
      </div>,
    ];
  });
  if (rows.length === 0) return null;
  return <div className="flex flex-col items-start gap-2">{rows}</div>;
}
