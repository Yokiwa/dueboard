import { useId, useMemo } from 'react';
import { browser } from 'wxt/browser';
import { buildDashboard, PALETTE } from '../../core/dashboard';
import { displayName } from '../../core/courseName';
import type { Settings as SettingsShape } from '../../core/types';
import { setCourseColor, setCourseVisible, setMerge, updateSettings } from '../../storage/store';
import { FEEDBACK_URL } from '../../ui/config';
import { field, label } from '../../ui/forms';
import { useStore } from '../../ui/hooks/useStore';
import { LangProvider, resolveLang, useT } from '../../ui/i18n';
import type { StoreShape } from '../../core/types';

const card = 'flex flex-col gap-3 rounded-[14px] border border-db-border bg-db-surface p-5';
const h2 = 'm-0 text-base font-semibold';
const hint = 'm-0 text-sm text-db-faint';

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
      <main className="mx-auto flex max-w-[720px] flex-col gap-5">
        <h1 className="m-0 text-2xl font-bold">{t('settings.title')}</h1>

        <section className={card}>
          <label className={label} htmlFor={`${id}-lang`}>
            {t('settings.language')}
            <select
              id={`${id}-lang`}
              className={field}
              value={store.settings.language}
              onChange={(e) => void updateSettings({ language: e.target.value as SettingsShape['language'] })}
            >
              <option value="auto">{t('lang.auto')}</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>

        <section className={card}>
          <h2 className={h2}>{t('settings.courses')}</h2>
          <p className={hint}>{sorted.length ? t('settings.coursesHint') : t('settings.noCourses')}</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {sorted.map((c) => (
              <li key={c.id} aria-label={c.code} className="flex flex-wrap items-center justify-between gap-3 border-t border-db-border-soft py-3 first:border-t-0">
                <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={t('settings.show', { code: c.code })}
                    checked={!c.hidden}
                    onChange={(e) => void setCourseVisible(c.id, e.target.checked)}
                    className="size-4 accent-db-accent"
                  />
                  <span className="font-semibold">{c.code}</span>
                  <span className="truncate text-db-faint">{displayName(c)}</span>
                </label>
                <div className="flex gap-1.5">
                  {PALETTE.map((color, i) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={t('settings.color', { code: c.code, n: i + 1 })}
                      aria-pressed={c.color === color}
                      onClick={() => void setCourseColor(c.id, color)}
                      className={`size-6 cursor-pointer rounded-full border-2 ${c.color === color ? 'border-db-ink' : 'border-transparent'}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
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

        <section className={card}>
          <h2 className={h2}>{t('settings.help')}</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {FEEDBACK_URL && (
              <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="text-db-accent">
                {t('settings.feedback')}
              </a>
            )}
            <a href={browser.runtime.getURL('/diagnostics.html')} target="_blank" rel="noopener noreferrer" className="text-db-accent">
              {t('settings.diagnostics')}
            </a>
          </div>
          <p className={hint}>{t('settings.privacy')}</p>
          <p className={hint}>{t('settings.version', { v: browser.runtime.getManifest().version })}</p>
        </section>
      </main>
    </div>
  );
}

export function Settings() {
  const store = useStore();
  if (!store) return null;
  return (
    <LangProvider lang={resolveLang(store.settings.language, navigator.language)}>
      <Body store={store} />
    </LangProvider>
  );
}
