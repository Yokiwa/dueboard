import { useId, useState, type FormEvent } from 'react';
import type { LinkCategory } from '../../core/types';
import { addManualLink } from '../../storage/store';
import { field, isWebUrl, label, primaryBtn, secondaryBtn } from '../forms';
import { useT, type MessageKey } from '../i18n';

const CATS: [LinkCategory, MessageKey][] = [
  ['website', 'cat.website'],
  ['homework', 'cat.homework'],
  ['textbook', 'cat.textbook'],
  ['discussion', 'cat.discussion'],
  ['other', 'cat.other'],
];

export function ManualLinkForm({ courseId, onDone }: { courseId: string; onDone(): void }) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<LinkCategory>('website');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('link.needLabel'));
    if (!isWebUrl(url)) return setError(t('link.badUrl'));
    await addManualLink({ courseId, label: name.trim(), url, category, source: 'manual' });
    onDone();
  };

  return (
    <form aria-label={t('link.add')} onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border border-db-border bg-db-subtle p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label} htmlFor={`${id}-name`}>
          {t('link.label')}
          <input id={`${id}-name`} className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={label} htmlFor={`${id}-url`}>
          {t('link.url')}
          <input id={`${id}-url`} type="url" className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <label className={label} htmlFor={`${id}-cat`}>
          {t('link.category')}
          <select id={`${id}-cat`} className={field} value={category} onChange={(e) => setCategory(e.target.value as LinkCategory)}>
            {CATS.map(([c, key]) => (
              <option key={c} value={c}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="m-0 body-5 text-db-urgent-fg">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn}>
          {t('form.save')}
        </button>
        <button type="button" className={secondaryBtn} onClick={onDone}>
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
