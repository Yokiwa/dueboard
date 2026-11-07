/** The DueBoard check mark, drawn inline so it follows the theme's accent color. */
export function BrandMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={`shrink-0 text-db-accent ${className}`} aria-hidden="true">
      <rect x="4" y="4" width="120" height="120" rx="28" fill="currentColor" />
      <path d="M36 66 L56 86 L94 44" fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
