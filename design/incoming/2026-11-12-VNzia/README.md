# VNzia's UI changes (uploaded 2026-11-12, not yet in the code)

These files were uploaded with the website's "Add files via upload" into the repository **root**.
The extension builds only from `src/` (`srcDir: 'src'` in `wxt.config.ts`) and tests only run from `tests/`,
so files in the root **never took effect**, and they were based on an older version.

They are kept here until someone moves the changes into the matching files in `src/` (on the latest `main`), following the table below.

| File here | Real file it belongs to | Status |
|---|---|---|
| `App.tsx` | `src/entrypoints/dashboard/App.tsx` | To merge |
| `main.tsx` | `src/entrypoints/dashboard/main.tsx` | To merge |
| `index.html` | `src/entrypoints/dashboard/index.html` | To merge |
| `dashboard.css` | New file → `src/entrypoints/dashboard/dashboard.css` | To merge |
| `AppShell.tsx` | `src/ui/components/AppShell.tsx` | To merge |
| `Header.tsx` | `src/ui/components/Header.tsx` | To merge |
| `NextDueBanner.tsx` | `src/ui/components/NextDueBanner.tsx` | To merge |
| `Onboarding.tsx` | `src/ui/components/Onboarding.tsx` | To merge |
| `ViewTabs.tsx` | `src/ui/components/ViewTabs.tsx` | To merge |
| `CourseCard.tsx` | `src/ui/views/CourseCard.tsx` | To merge |
| `i18n.tsx` | `src/ui/i18n.tsx` | To merge |
| `PomodoroTimer.tsx` | New file → `src/ui/components/PomodoroTimer.tsx` | To merge (the Pomodoro timer from PR #3 is not wired in yet either) |
| `pomodoro.test.tsx` | New file → `tests/ui/pomodoro.test.tsx` | To merge |

When a row is merged, change its status to "Merged"; once everything is merged, delete this folder.
