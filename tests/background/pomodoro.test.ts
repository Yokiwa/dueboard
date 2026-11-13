import { describe, expect, it, vi } from 'vitest';
import { POMODORO_ALARM, setPomodoroAlarm, type PomodoroAlarmApi } from '../../src/background/pomodoro';

describe('Pomodoro background alarm', () => {
  it('replaces the completion alarm with the current session end', async () => {
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const api: PomodoroAlarmApi = {
      clear: vi.fn(async () => true),
      create: vi.fn(async () => undefined),
    };
    const endsAt = Date.now() + 25 * 60_000;
    await setPomodoroAlarm(endsAt, api);
    expect(api.clear).toHaveBeenCalledWith(POMODORO_ALARM);
    expect(api.create).toHaveBeenCalledWith(POMODORO_ALARM, { when: endsAt });
    vi.useRealTimers();
  });

  it('clears the alarm when the timer is paused or reset', async () => {
    const api: PomodoroAlarmApi = {
      clear: vi.fn(async () => true),
      create: vi.fn(async () => undefined),
    };
    await setPomodoroAlarm(null, api);
    expect(api.clear).toHaveBeenCalledWith(POMODORO_ALARM);
    expect(api.create).not.toHaveBeenCalled();
  });
});
