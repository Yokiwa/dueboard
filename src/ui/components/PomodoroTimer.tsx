import { useEffect, useId, useState } from 'react';
import { Timer } from '@phosphor-icons/react';
import { primaryBtn, secondaryBtn } from '../forms';
import { useT } from '../i18n';
import { sendToBackground } from '../messaging';

const STORAGE_KEY = 'dueboard.pomodoro';
const MINUTES_MIN = 1;
const MINUTES_MAX = 180;
type Mode = 'focus' | 'break';

export interface PomodoroDurations {
  focus: number;
  break: number;
}

interface Session {
  mode: Mode;
  remainingMs: number;
  endsAt: number | null;
  durations: PomodoroDurations;
}

export const DEFAULT_POMODORO_DURATIONS: PomodoroDurations = { focus: 25, break: 5 };

function clampMinutes(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(value))) : fallback;
}

function readDurations(value: unknown): PomodoroDurations {
  const saved = value && typeof value === 'object' ? value as Partial<PomodoroDurations> : {};
  return {
    focus: clampMinutes(Number(saved.focus), DEFAULT_POMODORO_DURATIONS.focus),
    break: clampMinutes(Number(saved.break), DEFAULT_POMODORO_DURATIONS.break),
  };
}

function durationMs(mode: Mode, durations: PomodoroDurations): number {
  return durations[mode] * 60_000;
}

function ready(mode: Mode, durations: PomodoroDurations): Session {
  return { mode, remainingMs: durationMs(mode, durations), endsAt: null, durations };
}

function readSession(): Session {
  try {
    const saved: Partial<Session> | null = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const durations = readDurations(saved?.durations);
    if (
      saved && (saved.mode === 'focus' || saved.mode === 'break') &&
      typeof saved.remainingMs === 'number' && saved.remainingMs >= 0 && saved.remainingMs <= durationMs(saved.mode, durations) &&
      (saved.endsAt === null || (typeof saved.endsAt === 'number' && Number.isFinite(saved.endsAt)))
    ) {
      return { mode: saved.mode, remainingMs: saved.remainingMs, endsAt: saved.endsAt, durations };
    }
  } catch {
    // The timer can still run for this page when local storage is unavailable.
  }
  return ready('focus', DEFAULT_POMODORO_DURATIONS);
}

function timeLeft(session: Session, now: number): number {
  return session.endsAt === null
    ? session.remainingMs
    : Math.max(0, Math.min(session.remainingMs, session.endsAt - now));
}

export function PomodoroTimer({ now, compact = false }: { now: Date; compact?: boolean }) {
  const t = useT();
  const headingId = useId();
  const [session, setSession] = useState(readSession);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) setSession(readSession());
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    void sendToBackground({ type: 'pomodoroSchedule', endsAt: session.endsAt }).catch(() => undefined);
  }, [session.endsAt]);

  function update(next: Session) {
    setSession(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the in-page timer available.
    }
  }

  const remaining = timeLeft(session, now.getTime());
  const finished = remaining === 0;
  const running = session.endsAt !== null && !finished;
  const isReady = session.endsAt === null && remaining === durationMs(session.mode, session.durations);
  const totalSeconds = Math.ceil(remaining / 1000);
  const clock = [Math.floor(totalSeconds / 60), totalSeconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
  const nextMode = session.mode === 'focus' ? 'break' : 'focus';
  const action = finished
    ? t(nextMode === 'break' ? 'pomodoro.startBreak' : 'pomodoro.startFocus')
    : t(running ? 'pomodoro.pause' : isReady ? 'pomodoro.start' : 'pomodoro.resume');

  function handleAction() {
    const timestamp = Date.now();
    const left = timeLeft(session, timestamp);
    if (left === 0) {
      const next = ready(nextMode, session.durations);
      update({ ...next, endsAt: timestamp + next.remainingMs });
    } else if (session.endsAt !== null) {
      update({ ...session, remainingMs: left, endsAt: null });
    } else {
      update({ ...session, endsAt: timestamp + left });
    }
  }

  function changeDuration(mode: Mode, value: number) {
    const durations = { ...session.durations, [mode]: clampMinutes(value, session.durations[mode]) };
    update(mode === session.mode ? ready(mode, durations) : { ...session, durations });
  }

  return (
    <section aria-labelledby={headingId} className={`pomodoro-panel ${compact ? 'pomodoro-panel-compact' : ''} flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-db-border bg-db-surface px-5 py-4 shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-db-accent-soft text-db-accent">
          <Timer aria-hidden="true" size={22} />
        </span>
        <div>
          <h2 id={headingId} className="m-0 title-3 text-db-text">{t('pomodoro.title')}</h2>
          <div role="group" aria-label={t('pomodoro.mode')} className="mt-1 flex gap-1">
            {(['focus', 'break'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={session.mode === mode}
                disabled={running}
                onClick={() => {
                  if (mode !== session.mode) update(ready(mode, session.durations));
                }}
                className="db-press min-h-7 cursor-pointer rounded-md border-0 px-2 caption-3 text-db-muted hover:bg-db-hover aria-pressed:bg-db-accent-soft aria-pressed:text-db-accent disabled:cursor-default"
              >
                {t(`pomodoro.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span role="timer" aria-labelledby={headingId} className="pomodoro-clock font-mono heading-5 text-db-text tabular-nums">{clock}</span>
        <div className="flex gap-2">
          <button type="button" onClick={handleAction} className={primaryBtn}>{action}</button>
          <button type="button" disabled={isReady} onClick={() => update(ready(session.mode, session.durations))} className={secondaryBtn}>{t('pomodoro.reset')}</button>
        </div>
      </div>
      <fieldset className="w-full border-0 p-0" disabled={running}>
        <legend className="sr-only">{t('pomodoro.duration')}</legend>
        <div className="pomodoro-duration-fields grid gap-2">
          {(['focus', 'break'] as const).map((mode) => (
            <label key={mode} className="flex items-center justify-between gap-2 caption-3 text-db-muted">
              <span>{t(mode === 'focus' ? 'pomodoro.focusMinutes' : 'pomodoro.breakMinutes')}</span>
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={MINUTES_MIN}
                  max={MINUTES_MAX}
                  step={1}
                  aria-label={t(mode === 'focus' ? 'pomodoro.focusMinutes' : 'pomodoro.breakMinutes')}
                  value={session.durations[mode]}
                  onChange={(event) => changeDuration(mode, Number(event.target.value))}
                  className="w-16 rounded-lg border border-db-border bg-db-surface px-2 py-1 text-right text-db-text"
                />
                {t('pomodoro.minutesShort')}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div role="status" className={finished ? 'w-full caption-2 text-db-ok' : 'sr-only'}>
        {finished && t(session.mode === 'focus' ? 'pomodoro.focusComplete' : 'pomodoro.breakComplete')}
      </div>
    </section>
  );
}
