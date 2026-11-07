import { resolveLang, translate } from '../i18n';
import { AppShell } from './AppShell';

const bar = 'db-skeleton rounded-md';
/** Language comes from the browser here: the saved setting is exactly what is still loading. */
const label = () => translate(resolveLang('auto', navigator.language), 'loading');

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-db-border bg-db-surface p-6">
      <div className={`${bar} h-5 w-24`} />
      <div className={`${bar} h-6 w-3/4`} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 border-t border-db-border-soft pt-4">
          <div className={`${bar} size-4 shrink-0`} />
          <div className="flex grow flex-col gap-2">
            <div className={`${bar} h-4 w-2/3`} />
            <div className={`${bar} h-3 w-1/2`} />
          </div>
          <div className={`${bar} h-6 w-16`} />
        </div>
      ))}
    </div>
  );
}

/** Dashboard placeholder in the shape of the real page, shown while storage loads. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label={label()}>
      <AppShell nav={<div className={`${bar} h-9 w-64 rounded-xl`} />}>
        <div className="flex flex-col gap-3">
          <div className={`${bar} h-5 w-40`} />
          <div className={`${bar} h-10 w-full max-w-[480px]`} />
          <div className={`${bar} h-6 w-48 rounded-full`} />
        </div>
        <div className="db-skeleton h-36 rounded-2xl" />
        <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </AppShell>
    </div>
  );
}

/** Popup placeholder: the deadline card and a short list. */
export function PopupSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label={label()} className="flex w-[380px] flex-col gap-4 bg-db-bg p-4">
      <div className={`${bar} h-5 w-28`} />
      <div className="db-skeleton h-44 rounded-2xl" />
      <div className="flex flex-col gap-3 rounded-2xl border border-db-border bg-db-surface p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex grow flex-col gap-2">
              <div className={`${bar} h-4 w-2/3`} />
              <div className={`${bar} h-3 w-1/2`} />
            </div>
            <div className={`${bar} h-6 w-16`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings placeholder: title and three section cards. */
export function SettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label={label()} className="min-h-screen bg-db-bg px-4 py-10">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <div className={`${bar} h-8 w-56`} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border border-db-border bg-db-surface p-6">
            <div className={`${bar} h-6 w-40`} />
            <div className={`${bar} h-4 w-2/3`} />
            <div className={`${bar} h-10 w-full rounded-lg`} />
          </div>
        ))}
      </div>
    </div>
  );
}
