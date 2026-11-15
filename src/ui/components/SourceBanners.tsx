import type { SourceId, StoreShape } from '../../core/types';
import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';
import { primaryBtn } from '../forms';
import { useT } from '../i18n';

export const BRIGHTSPACE_LOGIN_URL = 'https://purdue.brightspace.com/d2l/login';

/**
 * Brightspace when its most recent sync attempt failed (an error newer than the last success). Only Brightspace: the
 * student signs in to nothing else. Every other platform is read through Brightspace by DueBoard itself, so its
 * failures are never the student's to fix and are not shown (they are retried on the next sync).
 */
export function failingSources(store: StoreShape): { src: SourceId; name: string; signedOut: boolean; err: { at: string; reason: string; detail?: string } }[] {
  const meta = store.syncMeta.brightspace;
  const err = meta?.lastError;
  if (!err) return [];
  if (meta.lastSuccess && Date.parse(meta.lastSuccess) >= Date.parse(err.at)) return [];
  return [{ src: 'brightspace', name: 'Brightspace', signedOut: err.reason === 'not_logged_in', err }];
}

/**
 * One line when the most recent Brightspace sync failed. None while a sync runs (`busy`): it may sign the student back
 * in by itself, so a line appears only once DueBoard has tried.
 */
export function SourceBanners({
  store,
  now,
  busy = false,
  onBrightspaceSignIn,
}: {
  store: StoreShape;
  now: Date;
  busy?: boolean;
  /** Signs in to Brightspace and comes back to DueBoard; without it, the sign-in page opens in a new tab. */
  onBrightspaceSignIn?: () => void;
}) {
  const t = useT();
  const rows = failingSources(store).flatMap(({ src, name, signedOut, err }) => {
    if (signedOut) {
      return [
        <div key={src} role="alert" className="db-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg py-2 pr-2 pl-4">
          <span className="flex items-center gap-2 body-5 text-db-urgent-fg">
            <WarningCircle aria-hidden="true" size={18} weight="fill" className="shrink-0" />
            <span className="flex flex-col">
              {t('source.relogin', { name })}
              {/* Everything else is read through Brightspace, so a sync stops after it: say so. */}
              <span className="caption-4">{t('source.brightspaceFirst')}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => (onBrightspaceSignIn ? onBrightspaceSignIn() : window.open(BRIGHTSPACE_LOGIN_URL, '_blank', 'noopener'))}
            className={primaryBtn}
          >
            {t('source.loginButton')}
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
