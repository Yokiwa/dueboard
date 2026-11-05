import { useEffect, useRef, useState } from 'react';
import { removeManualLink } from '../../storage/store';
import { ManualItemForm } from '../components/ManualItemForm';
import { ManualLinkForm } from '../components/ManualLinkForm';
import { secondaryBtn } from '../forms';
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
      className="m-auto w-[min(640px,calc(100vw-32px))] max-h-[85vh] overflow-auto rounded-2xl border border-db-border bg-db-surface p-0 text-db-text backdrop:bg-black/30"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 text-xl font-bold">
            {`${course.code} · ${course.name}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 cursor-pointer rounded-lg border border-db-border bg-db-surface px-3 text-sm text-db-text"
          >
            {t('detail.close')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryBtn} onClick={() => setAdding('item')}>
            {t('todo.add')}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setAdding('link')}>
            {t('link.add')}
          </button>
        </div>
        {adding === 'item' && <ManualItemForm courses={[course]} courseId={course.id} onDone={() => setAdding(null)} />}
        {adding === 'link' && <ManualLinkForm courseId={course.id} onDone={() => setAdding(null)} />}

        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold text-db-muted">{t('detail.items')}</h3>
          {items.length === 0 ? (
            <p className="m-0 text-sm text-db-faint">{t('detail.noItems')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {items.map((i) => (
                <li key={i.id} data-testid="detail-item" className="border-t border-db-border-soft py-2.5">
                  <ItemRow item={i} now={now} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {links.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold text-db-muted">{t('detail.links')}</h3>
            {CATEGORIES.map(([cat, key]) => {
              const group = links.filter((l) => l.category === cat);
              if (group.length === 0) return null;
              return (
                <div key={cat} className="flex flex-col gap-2">
                  <h4 className="m-0 text-xs font-semibold text-db-faint">{t(key)}</h4>
                  <div className="flex flex-wrap gap-2">
                    {group.map((l) => (
                      <span key={l.url} className="inline-flex items-center gap-1">
                        <LinkPill link={l} />
                        {l.source === 'manual' && (
                          <button
                            type="button"
                            aria-label={t('link.delete', { label: l.label })}
                            onClick={() => void removeManualLink(l.courseId, l.url)}
                            className="min-h-8 cursor-pointer rounded-md border-0 bg-transparent px-1.5 text-db-faint hover:text-db-urgent-fg"
                          >
                            ×
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
