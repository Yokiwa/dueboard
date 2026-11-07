import { CalendarBlank, ListChecks, SquaresFour, type Icon } from '@phosphor-icons/react';
import { useT, type MessageKey } from '../i18n';

export type View = 'courses' | 'calendar' | 'todo';
const VIEWS: [View, MessageKey, Icon][] = [
  ['courses', 'tabs.courses', SquaresFour],
  ['calendar', 'tabs.calendar', CalendarBlank],
  ['todo', 'tabs.todo', ListChecks],
];

export function ViewTabs({ view, onChange }: { view: View; onChange(v: View): void }) {
  const t = useT();
  return (
    <div role="tablist" aria-label={t('tabs.label')} className="flex gap-1 rounded-xl bg-db-track p-1">
      {VIEWS.map(([v, key, Glyph]) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`db-press inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border-0 px-3 button-sm whitespace-nowrap ${
              active ? 'bg-db-surface text-db-text shadow-sm' : 'bg-transparent text-db-muted hover:text-db-text'
            }`}
          >
            <Glyph aria-hidden="true" size={16} weight={active ? 'fill' : 'regular'} className="hidden sm:block" />
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}
