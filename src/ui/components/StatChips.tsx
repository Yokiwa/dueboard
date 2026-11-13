import { Clock, Fire } from '@phosphor-icons/react';
import { useT } from '../i18n';

export function StatChips({ within48, week }: { within48: number; week: number }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {within48 > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-db-urgent-bg px-3 py-1 caption-3 text-db-urgent-fg">
          <Fire aria-hidden="true" size={16} weight="fill" className="db-flame" />
          {t('chips.within48', { n: within48 })}
        </span>
      )}
      <span className="inline-flex items-center gap-1 rounded-full bg-db-normal-bg px-3 py-1 caption-4 text-db-normal-fg">
        <Clock aria-hidden="true" size={14} />
        {t('chips.week', { n: week })}
      </span>
    </div>
  );
}
