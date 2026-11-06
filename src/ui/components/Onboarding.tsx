import { useState } from 'react';
import type { SyncReport } from '../../sync/runSync';
import { SOURCES, type SourceId } from '../../core/types';
import { sendToBackground } from '../messaging';
import { useT } from '../i18n';
import { primaryBtn } from '../forms';

const NAMES: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope', pearson: 'Pearson' };
const step = 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-border bg-db-surface p-4';
const linkBtn = 'rounded-lg border border-db-border bg-db-subtle px-3 py-2 text-sm font-medium text-db-text no-underline hover:bg-db-track';

/** First-run guide, shown until the first platform has synced successfully. */
export function Onboarding() {
  const t = useT();
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);

  const start = async () => {
    setSyncing(true);
    try {
      setReport(await sendToBackground<SyncReport>({ type: 'sync' }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-db-bg px-4 py-16">
      <main className="flex w-full max-w-[560px] flex-col gap-5">
        <h1 className="m-0 text-[28px] font-bold">{t('onb.title')}</h1>
        <p className="m-0 text-db-muted">{t('onb.intro')}</p>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          <li className={step}>
            <span>1. {t('onb.step1')}</span>
            <a className={linkBtn} href="https://purdue.brightspace.com/d2l/home" target="_blank" rel="noopener noreferrer">
              {t('onb.openBs')}
            </a>
          </li>
          <li className={step}>
            <span>2. {t('onb.step2')}</span>
            <a className={linkBtn} href="https://www.gradescope.com/" target="_blank" rel="noopener noreferrer">
              {t('onb.openGs')}
            </a>
          </li>
          <li className={step}>
            <span>3. {t('onb.step3')}</span>
            <button type="button" className={primaryBtn} onClick={start} disabled={syncing}>
              {syncing ? t('onb.syncing') : t('onb.start')}
            </button>
          </li>
        </ol>
        {report && (
          <ul role="status" className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {SOURCES.filter((s) => report[s]).map((s) => {
              const r = report[s]!;
              const name = NAMES[s];
              const text = r === 'ok' ? t('onb.ok', { name }) : r === 'not_logged_in' ? t('onb.notLoggedIn', { name }) : t('onb.failed', { name, reason: r });
              return (
                <li key={s} className={r === 'ok' ? 'text-db-text' : 'text-db-urgent-fg'}>
                  {text}
                </li>
              );
            })}
          </ul>
        )}
        <p className="m-0 text-xs text-db-faint">{t('onb.privacy')}</p>
      </main>
    </div>
  );
}
