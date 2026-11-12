import { ALL_SOURCES, type SourceId, type StoreShape } from '../../core/types';
import { launchLinks, relevantSources } from '../../core/platforms';
import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';
import { primaryBtn } from '../forms';
import { useT } from '../i18n';

const NAMES: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope', pearson: 'Pearson' };
export const LOGIN_URLS: Record<SourceId, string> = {
  brightspace: 'https://purdue.brightspace.com/d2l/login',
  gradescope: 'https://www.gradescope.com/login',
  pearson: 'https://purdue.brightspace.com/d2l/home',
};

/**
 * One line per platform whose most recent sync attempt failed. None while a sync runs (`busy`): it may sign the student
 * back in by itself, so a line appears only once DueBoard has tried.
 */
export function SourceBanners({ store, now, busy = false }: { store: StoreShape; now: Date; busy?: boolean }) {
  const t = useT();
  const relevant = relevantSources(store);
  const launches = launchLinks(store);
  const rows = ALL_SOURCES.filter((src) => relevant.includes(src)).flatMap((src) => {
    const meta = store.syncMeta[src];
    const err = meta?.lastError;
    if (!err) return [];
    if (meta.lastSuccess && Date.parse(meta.lastSuccess) >= Date.parse(err.at)) return [];
    const name = NAMES[src];
    if (err.reason === 'not_logged_in') {
      // Purdue reaches its platforms through Brightspace: re-opening that launch signs the student back in.
      const launch = src === 'brightspace' ? undefined : launches[src];
      const launched = Boolean(launch);
      const target = launch ?? LOGIN_URLS[src];
      return [
        <div key={src} role="alert" className="db-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg py-2 pr-2 pl-4">
          <span className="flex items-center gap-2 body-5 text-db-urgent-fg">
            <WarningCircle aria-hidden="true" size={18} weight="fill" className="shrink-0" />
            {launched ? t('source.reopen', { name }) : t('source.relogin', { name })}
          </span>
          <button type="button" onClick={() => window.open(target, '_blank', 'noopener')} className={primaryBtn}>
            {launched ? t('source.openPlatform', { name }) : t('source.loginButton')}
          </button>
        </div>,
      ];
    }
    const snap = store.snapshots[src];
    const text = snap ? t('source.stale', { name, ago: t('ago', { iso: snap.syncedAt, now }) }) : t('source.failed', { name });
    return [
      <div key={src} role="status" className="rounded-xl border border-db-border bg-db-surface px-4 py-3 body-6 text-db-muted">
        <span className="flex items-center gap-2">
          <ArrowsClockwise aria-hidden="true" size={16} className="shrink-0 text-db-faint" />
          {text}
        </span>
        <details className="mt-2 caption-5 text-db-faint">
          <summary className="db-press cursor-pointer rounded-sm hover:text-db-muted">{t('source.details')}</summary>
          <code className="mt-2 block rounded-md bg-db-subtle p-2 font-mono break-all whitespace-pre-wrap">{`${err.reason}${err.detail ? ` — ${err.detail}` : ''} (${t('ago', { iso: err.at, now })})`}</code>
        </details>
      </div>,
    ];
  });
  if (busy || rows.length === 0) return null;
  return <div className="flex flex-col gap-2">{rows}</div>;
}
