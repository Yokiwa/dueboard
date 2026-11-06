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
