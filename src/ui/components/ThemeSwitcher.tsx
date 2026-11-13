import { PaintBrush } from '@phosphor-icons/react';
import type { DashboardTheme } from '../../core/types';

const THEMES: DashboardTheme[] = ['nightowl', 'morning-dew', 'noon-cafe', 'dusk-lullaby', 'automatic'];
const LABELS: Record<DashboardTheme, string> = {
  nightowl: 'Nightowl',
  'morning-dew': 'Morning Dew',
  'noon-cafe': 'Noon Cafe',
  'dusk-lullaby': 'Dusk Lullaby',
  automatic: 'Automatic',
};

export function ThemeSwitcher({ theme, onChange }: { theme: DashboardTheme; onChange(theme: DashboardTheme): void }) {
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
  return (
    <button
      type="button"
      className="dashboard-theme-switcher db-press"
      aria-label={`Theme: ${LABELS[theme]}. Switch to ${LABELS[next]}`}
      title={`Switch to ${LABELS[next]}`}
      onClick={() => onChange(next)}
    >
      <PaintBrush aria-hidden="true" size={16} />
      <span>{LABELS[theme]}</span>
      <span className="theme-switcher-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
