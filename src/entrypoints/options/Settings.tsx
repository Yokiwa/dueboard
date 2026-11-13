import { useId, useMemo } from 'react';
import { browser } from 'wxt/browser';
import { ArrowLeft, ArrowUpRight, Check } from '@phosphor-icons/react';
import { BrandMark } from '../../ui/components/BrandMark';
import { buildDashboard, PALETTE } from '../../core/dashboard';
import { displayName } from '../../core/courseName';
import { saveSettings, setCourseColor, setCourseVisible, setMerge } from '../../storage/store';
import { grantedPlatforms } from '../../core/permissions';
import { useGranted } from '../../ui/hooks/useGranted';
import { secondaryBtn } from '../../ui/forms';
import { FEEDBACK_URL } from '../../ui/config';
import { field, label } from '../../ui/forms';
import { useStore } from '../../ui/hooks/useStore';
import { useT } from '../../ui/i18n';
import type { CompletedPlacement, DashboardTheme, StoreShape, VisitMode } from '../../core/types';

const card = 'db-rise flex flex-col gap-4 rounded-2xl border border-db-border bg-db-surface p-6 shadow-sm';
const h2 = 'm-0 heading-6';
const hint = 'm-0 body-6 text-db-faint';
const textLink = 'db-press inline-flex items-center gap-1 rounded-sm body-5 text-db-accent no-underline hover:underline hover:underline-offset-4';
const themes: { id: DashboardTheme; label: string; description: string }[] = [
  { id: 'nightowl', label: 'Nightowl', description: 'Low-glare midnight navy for late study sessions.' },
  { id: 'morning-dew', label: 'Morning Dew', description: 'Fresh mist, sky, and sage for an early start.' },
  { id: 'noon-cafe', label: 'Noon Cafe', description: 'Warm oat, coffee, and apricot for the afternoon.' },
  { id: 'dusk-lullaby', label: 'Dusk Lullaby', description: 'Muted plum and twilight blue for winding down.' },
  { id: 'automatic', label: 'Automatic', description: 'Fades between themes as the day changes.' },
];

function Body({ store }: { store: StoreShape }) {
  const t = useT();
  const id = useId();
  // All courses, including hidden ones, with their current colors.
  const all = useMemo(() => buildDashboard(store, new Date(), { includeHidden: true }).courses, [store]);
  const sorted = [...all].sort((a, b) => a.code.localeCompare(b.code));
  const bsCourses = sorted.filter((c) => c.sources.brightspace);
  const gsCourses = store.snapshots.gradescope?.courses ?? [];

  return (
    <div className="min-h-screen bg-db-bg px-4 py-10">
      <main className="mx-auto flex max-w-[720px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="size-8" />
            <h1 className="m-0 heading-5 tracking-tight">
              <span className="hero-text">{t('settings.title')}</span>
            </h1>
          </div>
          <a href={browser.runtime.getURL('/dashboard.html')} className={secondaryBtn}>
            <ArrowLeft aria-hidden="true" size={16} weight="bold" />
            Back to dashboard
          </a>
        </div>

        <section className={card}>
          <h2 className={h2}>Appearance</h2>
          <p className={hint}>Choose a dashboard theme. Your selection is saved automatically.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={store.settings.theme === theme.id}
                onClick={() => void saveSettings({ theme: theme.id })}
                className="db-press flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-db-border bg-db-subtle p-3 text-left text-db-text aria-pressed:ring-2 aria-pressed:ring-db-accent"
              >
                <span className={`theme-preview theme-preview-${theme.id}`} aria-hidden="true"><i /><i /><i /></span>
                <span className="title-3">{theme.label}</span>
                <span className="caption-3 text-db-faint">{theme.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className={h2}>{t('settings.courses')}</h2>
          <p className={hint}>{sorted.length ? t('settings.coursesHint') : t('settings.noCourses')}</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {sorted.map((c) => (
              <li key={c.id} aria-label={c.code} className="flex flex-wrap items-center justify-between gap-3 border-t border-db-border-soft py-3 first:border-t-0">
                <label className="flex min-w-0 cursor-pointer items-center gap-2 body-6">
                  <input
                    type="checkbox"
                    aria-label={t('settings.show', { code: c.code })}
                    checked={!c.hidden}
                    onChange={(e) => void setCourseVisible(c.id, e.target.checked)}
                    className="size-4"
                  />
                  <span className="body-4">{c.code}</span>
                  <span className="truncate text-db-faint">{displayName(c)}</span>
                </label>
                <div className="flex gap-2">
                  {PALETTE.map((color, i) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={t('settings.color', { code: c.code, n: i + 1 })}
                      aria-pressed={c.color === color}
                      onClick={() => void setCourseColor(c.id, color)}
                      className={`db-press inline-flex size-6 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white hover:scale-110 ${
                        c.color === color ? 'ring-2 ring-db-ink ring-offset-2 ring-offset-db-surface' : ''
                      }`}
                      style={{ background: color }}
                    >
                      {c.color === color && <Check aria-hidden="true" size={12} weight="bold" />}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <label className={label} htmlFor={`${id}-completed`}>
            {t('settings.completed')}
            <select
              id={`${id}-completed`}
              className={field}
              value={store.settings.completed}
              onChange={(e) => void saveSettings({ completed: e.target.value as CompletedPlacement })}
            >
              <option value="card">{t('settings.completed.card')}</option>
              <option value="section">{t('settings.completed.section')}</option>
            </select>
          </label>
        </section>

        <section className={card}>
          <h2 className={h2}>{t('settings.merge')}</h2>
          <p className={hint}>{gsCourses.length ? t('settings.mergeHint') : t('settings.noGs')}</p>
          {gsCourses.map((g) => {
            const key = `gradescope:${g.sourceCourseId}`;
            const current = store.userState.merges[key] ?? all.find((c) => c.sources.gradescope === g.sourceCourseId && c.sources.brightspace)?.id ?? '';
            return (
              <label key={key} className={label} htmlFor={`${id}-${key}`}>
                {t('settings.mergeInto', { name: g.name })}
                <select id={`${id}-${key}`} className={field} value={current} onChange={(e) => void setMerge(key, e.target.value || null)}>
                  <option value="">{t('settings.noMerge')}</option>
                  {bsCourses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {displayName(b) ? `${b.code} · ${displayName(b)}` : b.code}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </section>

        <ReadingPlatforms store={store} />

        <section className={card}>
          <h2 className={h2}>{t('settings.help')}</h2>
          <div className="flex flex-wrap gap-6">
            {FEEDBACK_URL && (
              <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className={textLink}>
                {t('settings.feedback')}
                <ArrowUpRight aria-hidden="true" size={14} weight="bold" />
              </a>
            )}
            <a href={browser.runtime.getURL('/diagnostics.html')} target="_blank" rel="noopener noreferrer" className={textLink}>
              {t('settings.diagnostics')}
              <ArrowUpRight aria-hidden="true" size={14} weight="bold" />
            </a>
          </div>
          <p className={hint}>{t('settings.privacy')}</p>
          <p className={hint}>{t('settings.version', { v: browser.runtime.getManifest().version })}</p>
        </section>
      </main>
    </div>
  );
}

function ReadingPlatforms({ store }: { store: StoreShape }) {
  const t = useT();
  const id = useId();
  const granted = useGranted();
  const fallbackOff = store.settings.visits === 'off';
  const platforms = granted ? grantedPlatforms(granted) : [];
  return (
    <section className={card}>
      <h2 className={h2}>{t('settings.reading')}</h2>
      <p className={hint}>{t('settings.readingHint')}</p>
      <label className={label} htmlFor={`${id}-visits`}>
        {t('settings.visits')}
        <select id={`${id}-visits`} className={field} value={store.settings.visits} onChange={(e) => void saveSettings({ visits: e.target.value as VisitMode })}>
          <option value="auto">{t('settings.visits.auto')}</option>
          <option value="manual">{t('settings.visits.manual')}</option>
          <option value="off">{t('settings.visits.off')}</option>
        </select>
      </label>
      <label className={`${label} flex-row items-center gap-3`}>
        <input
          type="checkbox"
          checked={store.settings.windowFallback}
          disabled={fallbackOff}
          aria-describedby={fallbackOff ? `${id}-fallback-off` : undefined}
          onChange={(e) => void saveSettings({ windowFallback: e.target.checked })}
        />
        {t('settings.windowFallback')}
      </label>
      {fallbackOff && (
        <p id={`${id}-fallback-off`} className={hint}>
          {t('settings.windowFallbackOff')}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <span className="caption-3 text-db-muted">{t('settings.access')}</span>
        {platforms.length === 0 && <p className={hint}>{t('settings.noAccess')}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {platforms.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 body-5">
              {p.label}
              <button
                type="button"
                aria-label={t('settings.remove', { name: p.label })}
                className={secondaryBtn}
                onClick={() => void browser.permissions.remove({ origins: p.origins }).catch(() => false)}
              >
                {t('settings.removeLabel')}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex items-center gap-3 body-5">
        <input type="checkbox" checked={store.settings.syllabus} onChange={(e) => void saveSettings({ syllabus: e.target.checked })} />
        {t('settings.syllabus')}
      </label>
    </section>
  );
}

export function Settings() {
  const store = useStore();
  if (!store) return null;
  return (
    <Body store={store} />
  );
}
