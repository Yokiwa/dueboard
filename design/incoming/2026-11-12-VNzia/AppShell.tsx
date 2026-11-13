import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="dashboard-shell">
      <nav className="dashboard-rail">
        <span className="dashboard-brand">
          <BrandMark />
          <span>DueBoard</span>
        </span>
        {nav}
      </nav>
      <main id="main" className="dashboard-main">
        {children}
      </main>
    </div>
  );
}
