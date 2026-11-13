import { useEffect, useId, useState } from 'react';
import { Timer } from '@phosphor-icons/react';
import { primaryBtn, secondaryBtn } from '../forms';
import { useT } from '../i18n';

const STORAGE_KEY = 'dueboard.pomodoro';
const DURATION_MS = { focus: 25 * 60_000, break: 5 * 60_000 };
type Mode = keyof typeof DURATION_MS;

interface Session {
  mode: Mode;
  remainingMs: number;
  endsAt: number | null;
}

function ready(mode: Mode): Session {
  return { mode, remainingMs: DURATION_MS[mode], endsAt: null };
}

function readSession(): Session {
  try {
    const saved: Partial<Session> | null = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      saved && (saved.mode === 'focus' || saved.mode === 'break') &&
      typeof saved.remainingMs === 'number' && saved.remainingMs >= 0 && saved.remainingMs <= DURATION_MS[saved.mode] &&
      (saved.endsAt === null || (typeof saved.endsAt === 'number' && Number.isFinite(saved.endsAt)))
    ) {
      return { mode: saved.mode, remainingMs: saved.remainingMs, endsAt: saved.endsAt };
    }
  } catch {
    // The timer can still run for this page when browser storage is unavailable.
  }
  return ready('focus');
}

function timeLeft(session: Session, now: number): number {
  return session.endsAt === null
    ? session.remainingMs
    : Math.max(0, Math.min(session.remainingMs, session.endsAt - now));
}

export function PomodoroTimer({ now }: { now: Date }) {
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
  const isReady = session.endsAt === null && remaining === DURATION_MS[session.mode];
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
      update({ ...ready(nextMode), endsAt: timestamp + DURATION_MS[nextMode] });
    } else if (session.endsAt !== null) {
      update({ ...session, remainingMs: left, endsAt: null });
    } else {
      update({ ...session, endsAt: timestamp + left });
    }
  }

  return (
    <section aria-labelledby={headingId} className="pomodoro-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-db-border bg-db-surface px-5 py-4 shadow-sm">
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
                  if (mode !== session.mode) update(ready(mode));
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
          <button type="button" disabled={isReady} onClick={() => update(ready(session.mode))} className={secondaryBtn}>{t('pomodoro.reset')}</button>
        </div>
      </div>
      <div role="status" className={finished ? 'w-full caption-2 text-db-ok' : 'sr-only'}>
        {finished && t(session.mode === 'focus' ? 'pomodoro.focusComplete' : 'pomodoro.breakComplete')}
      </div>
    </section>
  );
}
