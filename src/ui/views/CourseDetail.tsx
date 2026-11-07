import { useEffect, useRef, useState } from 'react';
import { removeManualLink, toggleDone } from '../../storage/store';
import { useMarkDone } from '../components/DoneToast';
import { ManualItemForm } from '../components/ManualItemForm';
import { ManualLinkForm } from '../components/ManualLinkForm';
import { Link, Plus, X } from '@phosphor-icons/react';
import { iconBtn, secondaryBtn } from '../forms';
import { displayName } from '../../core/courseName';
import type { Course, CourseLink, Item, LinkCategory } from '../../core/types';
import { useT, type MessageKey } from '../i18n';
import { ItemRow } from '../components/ItemRow';
import { LinkPill } from '../components/LinkPill';

const CATEGORIES: [LinkCategory, MessageKey][] = [
  ['lms', 'cat.lms'],
  ['homework', 'cat.homework'],
  ['textbook', 'cat.textbook'],
  ['discussion', 'cat.discussion'],
  ['website', 'cat.website'],
  ['other', 'cat.other'],
];

export interface CourseDetailProps {
  course: Course;
  items: Item[];
  links: CourseLink[];
  now: Date;
  onClose(): void;
}

export function CourseDetail({ course, items, links, now, onClose }: CourseDetailProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `detail-${course.id}`;
  const [adding, setAdding] = useState<'item' | 'link' | null>(null);
  const markDone = useMarkDone();

  // Open as a real modal (backdrop, focus trap, Esc). Fall back to a plain open dialog where showModal is missing.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg || dlg.open) return;
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute('open', '');
    }
  }, []);

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className="db-rise m-auto w-[min(640px,calc(100vw-32px))] max-h-[85vh] overflow-auto rounded-2xl border border-db-border bg-db-surface p-0 text-db-text shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 heading-6">
            {displayName(course) ? `${course.code} · ${displayName(course)}` : course.code}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('detail.close')} className={iconBtn}>
            <X aria-hidden="true" size={16} weight="bold" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryBtn} onClick={() => setAdding('item')}>
            <Plus aria-hidden="true" size={16} weight="bold" />
            {t('todo.add')}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setAdding('link')}>
            <Link aria-hidden="true" size={16} weight="bold" />
            {t('link.add')}
          </button>
        </div>
        {adding === 'item' && <ManualItemForm courses={[course]} courseId={course.id} onDone={() => setAdding(null)} />}
        {adding === 'link' && <ManualLinkForm courseId={course.id} onDone={() => setAdding(null)} />}

        <section className="flex flex-col gap-2">
          <h3 className="m-0 caption-3 tracking-wide text-db-muted">{t('detail.items')}</h3>
          {items.length === 0 ? (
            <p className="m-0 rounded-xl bg-db-subtle px-4 py-6 text-center body-6 text-db-faint">{t('detail.noItems')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {items.map((i) => (
                <li key={i.id} data-testid="detail-item" className="flex items-center gap-3 border-t border-db-border-soft py-3">
                  <input
                    type="checkbox"
                    aria-label={t('done.mark', { title: i.title })}
                    checked={i.doneByUser || i.submitted}
                    disabled={i.submitted}
                    onChange={(e) => void (e.target.checked ? markDone(i) : toggleDone(i.sourceKeys, false))}
                    className="size-4 shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0 grow">
                    <ItemRow item={i} now={now} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {links.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="m-0 caption-3 tracking-wide text-db-muted">{t('detail.links')}</h3>
            {CATEGORIES.map(([cat, key]) => {
              const group = links.filter((l) => l.category === cat);
              if (group.length === 0) return null;
              return (
                <div key={cat} className="flex flex-col gap-2">
                  <h4 className="m-0 caption-4 text-db-faint">{t(key)}</h4>
                  <div className="flex flex-wrap gap-2">
                    {group.map((l) => (
                      <span key={l.url} className="inline-flex items-center gap-1">
                        <LinkPill link={l} />
                        {l.source === 'manual' && (
                          <button
                            type="button"
                            aria-label={t('link.delete', { label: l.label })}
                            onClick={() => void removeManualLink(l.courseId, l.url)}
                            className="db-press inline-flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-db-faint hover:bg-db-urgent-bg hover:text-db-urgent-fg"
                          >
                            <X aria-hidden="true" size={14} weight="bold" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </dialog>
  );
}
