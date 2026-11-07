import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

/** Page frame: floating translucent nav on top, then a centered 1200px column with 24px gaps. */
export function AppShell({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-db-bg px-4 pt-4 pb-16 sm:px-6">
      {nav && (
        <nav className="sticky top-4 z-40 mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl border border-db-border bg-db-glass p-1 pl-3 shadow-sm backdrop-blur-xl">
          <span className="flex items-center gap-2 title-4 text-db-text">
            <BrandMark />
            <span className="hidden sm:inline">DueBoard</span>
          </span>
          {nav}
        </nav>
      )}
      <main id="main" className="mx-auto flex max-w-[1200px] flex-col gap-6 pt-8">
        {children}
      </main>
    </div>
  );
}
