import { useT } from '../i18n';

export function StatChips({ within48, week }: { within48: number; week: number }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {within48 > 0 && (
        <span className="rounded-full bg-db-urgent-bg px-3 py-1.5 text-[13px] font-semibold text-db-urgent-fg">{t('chips.within48', { n: within48 })}</span>
      )}
      <span className="rounded-full bg-db-border px-3 py-1.5 text-[13px] font-medium text-db-text-2">{t('chips.week', { n: week })}</span>
    </div>
  );
}
