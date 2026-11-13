import { CalendarBlank, ListChecks, MusicNotes, SquaresFour, Timer, type Icon } from '@phosphor-icons/react';
import { useT, type MessageKey } from '../i18n';

export type View = 'courses' | 'calendar' | 'todo' | 'timer' | 'music';
const VIEWS: [View, MessageKey, Icon][] = [
  ['courses', 'tabs.courses', SquaresFour],
  ['calendar', 'tabs.calendar', CalendarBlank],
  ['todo', 'tabs.todo', ListChecks],
  ['timer', 'tabs.timer', Timer],
  ['music', 'tabs.music', MusicNotes],
];

export function ViewTabs({ view, onChange }: { view: View; onChange(v: View): void }) {
  const t = useT();
  return (
    <div role="tablist" aria-label={t('tabs.label')} className="dashboard-tabs">
      {VIEWS.map(([v, key, Glyph]) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className="dashboard-tab db-press"
          >
            <Glyph aria-hidden="true" size={20} weight={active ? 'fill' : 'regular'} />
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}
