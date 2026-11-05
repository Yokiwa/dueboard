import { useT } from '../i18n';
import { primaryBtn } from '../forms';

/** What a new tab shows when the user chose "plain blank page" in settings. */
export function BlankTab({ onOpen }: { onOpen(): void }) {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-db-bg">
      <button type="button" className={primaryBtn} onClick={onOpen}>
        {t('blank.open')}
      </button>
    </div>
  );
}
