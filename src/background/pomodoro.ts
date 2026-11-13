import { browser } from 'wxt/browser';
import { IS_FIREFOX } from '../core/env';
import { playCompletionCue } from '../pomodoro/sound';
import { ensureOffscreenDocument } from '../sync/offscreenParser';

export const POMODORO_ALARM = 'dueboard-pomodoro-complete';

export interface PomodoroAlarmApi {
  clear(name: string): Promise<boolean>;
  create(name: string, info: { when: number }): Promise<void>;
}

export async function setPomodoroAlarm(endsAt: number | null, alarms: PomodoroAlarmApi = browser.alarms): Promise<void> {
  await alarms.clear(POMODORO_ALARM);
  if (endsAt !== null && Number.isFinite(endsAt) && endsAt > Date.now()) {
    await alarms.create(POMODORO_ALARM, { when: endsAt });
  }
}

export async function playPomodoroCompletion(): Promise<void> {
  if (IS_FIREFOX) {
    playCompletionCue();
    return;
  }
  await ensureOffscreenDocument();
  await browser.runtime.sendMessage({ target: 'offscreen', kind: 'pomodoroComplete' });
}
