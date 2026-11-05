import { useId, useState, type FormEvent } from 'react';
import type { Course } from '../../core/types';
import { addManualItem } from '../../storage/store';
import { field, isWebUrl, label, primaryBtn, secondaryBtn } from '../forms';
import { useT } from '../i18n';

export interface ManualItemFormProps {
  courses: Course[];
  /** When set, the item is added to this course and the course picker is hidden. */
  courseId?: string;
  onDone(): void;
}

export function ManualItemForm({ courses, courseId, onDone }: ManualItemFormProps) {
  const t = useT();
  const id = useId();
  const [course, setCourse] = useState(courseId ?? '');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!course || !title.trim()) return setError(t('form.needTitle'));
    if (url && !isWebUrl(url)) return setError(t('link.badUrl'));
    const fallback = courses.find((c) => c.id === course)?.url ?? '';
    await addManualItem({ courseId: course, title: title.trim(), dueAt: due ? new Date(due).toISOString() : null, url: url || fallback });
    onDone();
  };

  return (
    <form aria-label={t('todo.add')} onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border border-db-border bg-db-subtle p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {!courseId && (
          <label className={label} htmlFor={`${id}-course`}>
            {t('form.course')}
            <select id={`${id}-course`} className={field} value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">{t('form.pickCourse')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={label} htmlFor={`${id}-title`}>
          {t('form.title')}
          <input id={`${id}-title`} className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={label} htmlFor={`${id}-due`}>
          {t('form.due')}
          <input id={`${id}-due`} type="datetime-local" className={field} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className={label} htmlFor={`${id}-url`}>
          {t('form.url')}
          <input id={`${id}-url`} type="url" className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-db-urgent-fg">
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
