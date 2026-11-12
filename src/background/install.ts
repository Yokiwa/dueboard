import type { Settings } from '../core/types';

/** True when dotted numeric version a is lower than b ("1.10.0" is above "1.4.0"). */
function versionBelow(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

/** On update to 1.4.0: "manual" was the old default and windows are now only a fallback, so it becomes "auto" once. */
export function settingsAfterUpdate(settings: Settings, previousVersion: string | undefined): Settings {
  if (previousVersion && settings.visits === 'manual' && versionBelow(previousVersion, '1.4.0')) return { ...settings, visits: 'auto' };
  return settings;
}

export interface InstallDeps {
  openDashboard(): Promise<unknown>;
  ensureAlarm(): Promise<unknown>;
  sync(): Promise<unknown>;
}

/**
 * runtime.onInstalled: always (re)schedule and sync; on a first install also open the dashboard,
 * since DueBoard no longer takes over the new tab page and the welcome guide must be seen once.
 */
export async function handleInstalled(reason: string, deps: InstallDeps): Promise<void> {
  await deps.ensureAlarm();
  if (reason === 'install') await deps.openDashboard();
  await deps.sync();
}
