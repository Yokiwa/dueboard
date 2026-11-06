import { useState } from 'react';
import { linksBundle, scrubPage } from '../../diagnostics/pageExport';
import type { StoreShape } from '../../core/types';
import { captureActivePage, downloadText } from '../devExport';
import { useT } from '../i18n';

const btn = 'min-h-9 cursor-pointer rounded-lg border border-db-border bg-db-surface px-3 text-xs font-medium text-db-text';

/** Exports for helping the developer support a new platform. Nothing leaves the computer unless the user sends the file. */
export function DevTools({ store }: { store: StoreShape }) {
  const t = useT();
  const [note, setNote] = useState('');

  const exportPage = async () => {
    try {
      const { url, html } = await captureActivePage();
      const name = `dueboard-page-${new URL(url).hostname}.html`;
      downloadText(name, scrubPage(html, url, [], new Date()));
      setNote(t('dev.saved', { name }));
    } catch {
      setNote(t('dev.failed'));
    }
  };

  const exportLinks = () => {
    const name = 'dueboard-links.json';
    downloadText(name, JSON.stringify(linksBundle(store, new Date()), null, 2));
    setNote(t('dev.saved', { name }));
  };

  return (
    <details className="rounded-xl border border-db-border bg-db-surface px-3 py-2 text-xs text-db-muted">
      <summary className="cursor-pointer font-semibold">{t('dev.title')}</summary>
      <p className="my-2">{t('dev.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={exportPage}>
          {t('dev.exportPage')}
        </button>
        <button type="button" className={btn} onClick={exportLinks}>
          {t('dev.exportLinks')}
        </button>
      </div>
      {note && (
        <p role="status" className="mt-2 mb-0 text-db-text">
          {note}
        </p>
      )}
    </details>
  );
}
