import { browser } from 'wxt/browser';
import { WarningCircle } from '@phosphor-icons/react';
import { missingRequired } from '../../core/permissions';
import { primaryBtn } from '../forms';
import { useT } from '../i18n';
import { joinNames } from '../joinNames';

const NAMES: Record<string, string> = {
  'https://purdue.brightspace.com/*': 'Brightspace',
  'https://www.gradescope.com/*': 'Gradescope',
  'https://mylab.pearson.com/*': 'Pearson',
};

/** Firefox lets users switch off an add-on's site access; this brings it back with one click. */
export function SiteAccessBanner({ granted }: { granted: string[] }) {
  const t = useT();
  const missing = missingRequired(granted);
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="db-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg py-2 pr-2 pl-4">
      <span className="flex items-center gap-2 body-5 text-db-urgent-fg">
        <WarningCircle aria-hidden="true" size={18} weight="fill" className="shrink-0" />
        {t('access.missing', { names: joinNames(missing.map((o) => NAMES[o] ?? o)) })}
      </span>
      <button type="button" onClick={() => void browser.permissions.request({ origins: missing }).catch(() => false)} className={primaryBtn}>
        {t('access.allow')}
      </button>
    </div>
  );
}
