import { useT, type MessageKey } from '../i18n';

export type View = 'courses' | 'calendar' | 'todo';
const VIEWS: [View, MessageKey][] = [
  ['courses', 'tabs.courses'],
  ['calendar', 'tabs.calendar'],
  ['todo', 'tabs.todo'],
];

export function ViewTabs({ view, onChange }: { view: View; onChange(v: View): void }) {
  const t = useT();
  return (
    <div role="tablist" aria-label={t('tabs.label')} className="flex gap-1 rounded-xl bg-db-track p-1">
      {VIEWS.map(([v, key]) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`min-h-10 cursor-pointer rounded-[9px] border-0 px-[18px] text-sm ${
              active ? 'bg-db-surface font-semibold text-db-text shadow-sm' : 'bg-transparent font-medium text-db-muted'
            }`}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}
