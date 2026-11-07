import { useState } from 'react';
import { ArrowUpRight, CheckCircle, LockSimple, WarningCircle } from '@phosphor-icons/react';
import type { SyncReport } from '../../sync/runSync';
import { SOURCES, type SourceId } from '../../core/types';
import { sendToBackground } from '../messaging';
import { useT } from '../i18n';
import { primaryBtn, secondaryBtn } from '../forms';
import { BrandMark } from './BrandMark';

const NAMES: Record<SourceId, string> = { brightspace: 'Brightspace', gradescope: 'Gradescope', pearson: 'Pearson' };
const step = 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-db-border bg-db-surface p-4';
const num = 'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-db-accent-soft caption-3 text-db-accent tabular-nums';

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

  const steps = [
    { text: t('onb.step1'), action: <a className={secondaryBtn} href="https://purdue.brightspace.com/d2l/home" target="_blank" rel="noopener noreferrer">{t('onb.openBs')}<ArrowUpRight aria-hidden="true" size={14} weight="bold" /></a> },
    { text: t('onb.step2'), action: <a className={secondaryBtn} href="https://www.gradescope.com/" target="_blank" rel="noopener noreferrer">{t('onb.openGs')}<ArrowUpRight aria-hidden="true" size={14} weight="bold" /></a> },
    { text: t('onb.step3'), action: <button type="button" className={primaryBtn} onClick={start} disabled={syncing}>{syncing ? t('onb.syncing') : t('onb.start')}</button> },
  ];

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
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {steps.map((s, i) => (
            <li key={i} className={step}>
              <span className="flex min-w-0 items-center gap-3 body-5 text-db-text">
                <span aria-hidden="true" className={num}>
                  {i + 1}
                </span>
                {s.text}
              </span>
              {s.action}
            </li>
          ))}
        </ol>
        {report && (
          <ul role="status" className="m-0 flex list-none flex-col gap-2 p-0">
            {SOURCES.filter((s) => report[s]).map((s) => {
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
