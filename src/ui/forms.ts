/** Shared Tailwind classes for the small manual-entry forms. */
export const field = 'min-h-10 rounded-lg border border-db-border bg-db-surface px-3 text-sm text-db-text';
export const label = 'flex flex-col gap-1 text-xs font-semibold text-db-muted';
export const primaryBtn = 'min-h-10 cursor-pointer rounded-lg border-0 bg-db-ink px-4 text-sm font-semibold text-db-on-ink';
export const secondaryBtn = 'min-h-10 cursor-pointer rounded-lg border border-db-border bg-db-surface px-4 text-sm text-db-text';

export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
