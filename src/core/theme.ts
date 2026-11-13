import type { DashboardTheme } from './types';

export type TimeTheme = Exclude<DashboardTheme, 'automatic'>;

export function automaticTheme(now: Date): TimeTheme {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning-dew';
  if (hour >= 12 && hour < 18) return 'noon-cafe';
  if (hour >= 18 && hour < 23) return 'dusk-lullaby';
  return 'nightowl';
}

export function displayedTheme(theme: DashboardTheme, now: Date): TimeTheme {
  return theme === 'automatic' ? automaticTheme(now) : theme;
}
