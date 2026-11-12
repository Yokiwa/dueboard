import { browser } from 'wxt/browser';
import { WarningCircle } from '@phosphor-icons/react';
import { hostMatches, PLATFORMS } from '../../core/platformRegistry';
import { missingRequired } from '../../core/permissions';
import { primaryBtn } from '../forms';
import { useT } from '../i18n';
import { joinNames } from '../joinNames';

const BRIGHTSPACE = 'https://purdue.brightspace.com/*';

/** "Brightspace" for its origin, otherwise the label of the registry platform that owns the host. */
function originName(origin: string): string {
  if (origin === BRIGHTSPACE) return 'Brightspace';
  const host = /^https?:\/\/([^/]+)\//.exec(origin)?.[1] ?? origin;
  return PLATFORMS.find((x) => x.hosts.includes(host))?.label ?? PLATFORMS.find((x) => x.hosts.some((h) => hostMatches(h, host.replace(/^\*\./, ''))))?.label ?? origin;
}

/** Firefox lets users switch off an add-on's site access; this brings it back with one click. */
export function SiteAccessBanner({ granted }: { granted: string[] }) {
  const t = useT();
  const missing = missingRequired(granted);
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="db-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-db-alert-border bg-db-alert-bg py-2 pr-2 pl-4">
      <span className="flex items-center gap-2 body-5 text-db-urgent-fg">
        <WarningCircle aria-hidden="true" size={18} weight="fill" className="shrink-0" />
        {t('access.missing', { names: joinNames([...new Set(missing.map(originName))]) })}
      </span>
      <button type="button" onClick={() => void browser.permissions.request({ origins: missing }).catch(() => false)} className={primaryBtn}>
        {t('access.allow')}
      </button>
    </div>
  );
}
