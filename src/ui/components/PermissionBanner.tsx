import { browser } from 'wxt/browser';
import { Key } from '@phosphor-icons/react';
import { accessToAsk, snoozeUntil } from '../../core/permissions';
import type { StoreShape } from '../../core/types';
import { patchVisitState } from '../../storage/store';
import { primaryBtn, secondaryBtn } from '../forms';
import { useT } from '../i18n';
import { joinNames } from '../joinNames';
import { sendToBackground } from '../messaging';

/**
 * Asks for site access to the homework platforms found in the student's courses, all at once. Site access is only
 * ever requested from this click (browsers require a user gesture), and "Not now" postpones it for a week.
 */
export function PlatformAccess({ store, granted, now }: { store: StoreShape; granted: string[]; now: Date }) {
  const t = useT();
  const asks = accessToAsk(store, granted, now);
  if (asks.length === 0) return null;

  const allow = async () => {
    const ok = await browser.permissions.request({ origins: asks.flatMap((a) => a.origins) }).catch(() => false);
    if (ok) await sendToBackground({ type: 'sync', trigger: 'manual' }).catch(() => undefined);
  };
  const later = async () => {
    const until = snoozeUntil(now);
    await patchVisitState({ snoozed: { ...store.visitState.snoozed, ...Object.fromEntries(asks.map((a) => [a.key, until])) } });
  };

  return (
    <div role="status" className="db-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-border bg-db-surface py-2 pr-2 pl-4">
      <span className="flex items-center gap-2 body-5 text-db-text">
        <Key aria-hidden="true" size={18} className="shrink-0 text-db-accent" />
        {t('access.ask', { names: joinNames(asks.map((a) => a.label)) })}
      </span>
      <span className="flex gap-2">
        <button type="button" onClick={() => void later()} className={secondaryBtn}>
          {t('access.later')}
        </button>
        <button type="button" onClick={() => void allow()} className={primaryBtn}>
          {t('access.allow')}
        </button>
      </span>
    </div>
  );
}
