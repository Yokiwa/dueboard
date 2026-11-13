import { describe, it, expect, vi } from 'vitest';
import { handleInstalled, settingsAfterUpdate } from '../../src/background/install';

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

describe('settingsAfterUpdate', () => {
  const base = { syllabus: true, completed: 'card' as const, windowFallback: true, theme: 'automatic' as const };
  it('turns the old default (manual) into auto when updating from before 1.4.0', () => {
    expect(settingsAfterUpdate({ ...base, visits: 'manual' }, '1.2.4').visits).toBe('auto');
  });
  it('keeps off', () => {
    expect(settingsAfterUpdate({ ...base, visits: 'off' }, '1.2.4').visits).toBe('off');
  });
  it('keeps manual when the student already had 1.4.0 or later', () => {
    expect(settingsAfterUpdate({ ...base, visits: 'manual' }, '1.4.0').visits).toBe('manual');
    expect(settingsAfterUpdate({ ...base, visits: 'manual' }, '1.4.1').visits).toBe('manual');
    expect(settingsAfterUpdate({ ...base, visits: 'manual' }, '1.10.0').visits).toBe('manual');
  });
  it('never switches on a version it cannot read', () => {
    expect(settingsAfterUpdate({ ...base, visits: 'manual' }, '1.4').visits).toBe('manual');
    expect(settingsAfterUpdate({ ...base, visits: 'manual' }, 'abc').visits).toBe('manual');
  });
  it('leaves settings unchanged without a previous version', () => {
    const s = { ...base, visits: 'manual' as const };
    expect(settingsAfterUpdate(s, undefined)).toEqual(s);
  });
  it('changes nothing else', () => {
    expect(settingsAfterUpdate({ visits: 'manual', syllabus: false, completed: 'section', windowFallback: false, theme: 'automatic' }, '1.3.0')).toEqual({ visits: 'auto', syllabus: false, completed: 'section', windowFallback: false, theme: 'automatic' });
  });
});
