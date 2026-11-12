import { useT } from '../i18n';

/** Past-due work nobody has said was handed in. */
export function NotSure() {
  const t = useT();
  return (
    <span title={t('item.notSureHint')} className="shrink-0 rounded-md border border-db-border px-2 py-0.5 caption-4 whitespace-nowrap text-db-muted">
      {t('item.notSure')}
    </span>
  );
}
