/** Shared Tailwind classes for the small manual-entry forms. */
export const field =
  'db-press min-h-10 rounded-lg border border-db-control bg-db-surface px-3 body-6 text-db-text hover:border-db-text focus-visible:border-db-ring';
export const label = 'flex flex-col gap-2 caption-3 text-db-muted';
/** Main button: 8px by 12px padding, Button-sm text, ink fill. */
export const primaryBtn =
  'db-press inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-db-ink px-3 py-2 button-sm text-db-on-ink no-underline hover:bg-db-ink-hover disabled:cursor-default disabled:opacity-50';
export const secondaryBtn =
  'db-press inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-db-border bg-db-surface px-3 py-2 button-sm text-db-text no-underline hover:bg-db-hover disabled:cursor-default disabled:opacity-50';
/** Square icon only button; always pair with an aria-label. */
export const iconBtn =
  'db-press inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-db-border bg-db-surface p-0 text-db-text hover:bg-db-hover';

export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
