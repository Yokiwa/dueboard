import { useEffect, useRef, useState } from 'react';
import { CheckCircle, LockSimple, WarningCircle } from '@phosphor-icons/react';
import type { SyncReport } from '../../sync/runSync';
import { ALL_SOURCES, type SourceId } from '../../core/types';
import { sendToBackground } from '../messaging';
import { useT } from '../i18n';
import { primaryBtn } from '../forms';
import { BrandMark } from './BrandMark';

const NAMES: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope', pearson: 'Pearson' };

/** First-run guide, shown until the first platform has synced successfully. */
export function Onboarding() {
  const t = useT();
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);

  const start = async () => {
    setSyncing(true);
    try {
      setReport(await sendToBackground<SyncReport>({ type: 'sync', trigger: 'manual' }));
    } finally {
      setSyncing(false);
    }
  };

  const login = async () => {
    setSyncing(true);
    try {
      const res = await sendToBackground<{ signedIn?: boolean } | null>({ type: 'beginLogin' });
      if (res?.signedIn) await start();
    } finally {
      setSyncing(false);
    }
  };

  // Back from signing in: the address carries ?start=1, so the sync starts at once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    const url = new URL(location.href);
    if (!url.searchParams.has('start')) return;
    autoStarted.current = true;
    url.searchParams.delete('start');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    void start();
  }, []);

  return (
    <div className="flex min-h-screen justify-center bg-db-bg px-4 py-16">
      <main className="db-rise flex w-full max-w-[560px] flex-col gap-6">
        <BrandMark className="size-12" />
        <div className="flex flex-col gap-3">
          <h1 className="m-0 heading-4 tracking-tight">
            <span className="hero-text">{t('onb.title')}</span>
          </h1>
          <p className="m-0 body-3 text-db-muted">{t('onb.intro')}</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <button type="button" className={primaryBtn} onClick={login} disabled={syncing}>
            {syncing ? t('onb.signingIn') : t('onb.login')}
          </button>
          <p className="m-0 caption-5 text-db-faint">{t('onb.already')}</p>
        </div>
        {report && (
          <ul role="status" className="m-0 flex list-none flex-col gap-2 p-0">
            {/* Brightspace always; other platforms only when they were found and read. */}
            {ALL_SOURCES.filter((s) => report[s] && (s === 'brightspace' || report[s] === 'ok')).map((s) => {
              const r = report[s]!;
              const name = NAMES[s];
              const text = r === 'ok' ? t('onb.ok', { name }) : r === 'not_logged_in' ? t('onb.notLoggedIn', { name }) : t('onb.failed', { name, reason: r });
              const Glyph = r === 'ok' ? CheckCircle : WarningCircle;
              return (
                <li key={s} className={`flex items-center gap-2 body-5 ${r === 'ok' ? 'text-db-ok' : 'text-db-urgent-fg'}`}>
                  <Glyph aria-hidden="true" size={18} weight="fill" className="shrink-0" />
                  {text}
                </li>
              );
            })}
          </ul>
        )}
        <p className="m-0 flex items-center gap-2 caption-5 text-db-faint">
          <LockSimple aria-hidden="true" size={14} className="shrink-0" />
          {t('onb.privacy')}
        </p>
      </main>
    </div>
  );
}
