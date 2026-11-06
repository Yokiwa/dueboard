import { describe, it, expect, vi } from 'vitest';
import { handleInstalled } from '../../src/background/install';

const deps = () => ({ openDashboard: vi.fn(async () => {}), ensureAlarm: vi.fn(async () => {}), sync: vi.fn(async () => ({})) });

describe('handleInstalled', () => {
  it('first install: schedules sync, syncs, and opens the dashboard so the welcome guide shows', async () => {
    const d = deps();
    await handleInstalled('install', d);
    expect(d.ensureAlarm).toHaveBeenCalled();
    expect(d.sync).toHaveBeenCalled();
    expect(d.openDashboard).toHaveBeenCalled();
  });
  it('update: schedules and syncs but does not open a tab', async () => {
    const d = deps();
    await handleInstalled('update', d);
    expect(d.ensureAlarm).toHaveBeenCalled();
    expect(d.sync).toHaveBeenCalled();
    expect(d.openDashboard).not.toHaveBeenCalled();
  });
});
