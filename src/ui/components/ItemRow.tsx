import { formatDueAt } from '../../core/time';
import type { Item } from '../../core/types';
import { useLang, useT } from '../i18n';
import { sourceLabel } from '../sourceLabel';
import { DueBadge } from './DueBadge';

/** Title + "source · due time" on the left, countdown badge on the right. The title links to the item. */
export function ItemRow({ item, now }: { item: Item; now: Date }) {
  const lang = useLang();
  const t = useT();
  const when = item.dueAt ? formatDueAt(new Date(item.dueAt), now, lang) : t('badge.noDue');
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          data-title
          className={`db-press truncate rounded-sm title-4 ${item.doneByUser || item.submitted ? 'text-db-faint line-through' : 'text-db-text no-underline hover:text-db-accent'}`}
        >
          {item.title}
        </a>
        <span className="caption-5 text-db-faint">{`${sourceLabel(item, t)} · ${when}`}</span>
      </div>
      <DueBadge dueAt={item.dueAt} done={item.doneByUser} submitted={item.submitted} now={now} />
    </div>
  );
}
