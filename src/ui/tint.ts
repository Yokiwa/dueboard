/** A course color mixed into the current surface, so the tint works in both light and dark themes. */
export const tint = (color: string | undefined, percent: number) =>
  color ? `color-mix(in srgb, ${color} ${percent}%, var(--color-db-surface))` : undefined;
