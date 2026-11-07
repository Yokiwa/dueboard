/**
 * The DueBoard mark: a countdown ring three quarters run, with the remaining time as a dot.
 * Drawn inline so it follows the theme's accent color; deliberately not a checkbox shape.
 */
export function BrandMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={`shrink-0 text-db-accent ${className}`} aria-hidden="true">
      <rect x="4" y="4" width="120" height="120" rx="32" fill="currentColor" />
      <circle cx="64" cy="64" r="32" fill="none" stroke="#FFFFFF" strokeOpacity="0.32" strokeWidth="12" />
      <path d="M64 32 A32 32 0 1 1 32 64" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
      <circle cx="64" cy="64" r="9" fill="#FFFFFF" />
    </svg>
  );
}
