import type { ReactNode } from 'react';

/** Page frame: gray background, centered 1200px column, 24px gaps (per the approved mockup). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-db-bg px-4 py-9 sm:px-6">
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6">{children}</main>
    </div>
  );
}
