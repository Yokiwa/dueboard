# Team handbook

- [CONTRIBUTING.md](../../CONTRIBUTING.md): how we work together (read this first)
- [git-workflow.md](git-workflow.md): step by step in GitHub Desktop
- Below: what each folder in the repository is for

## Folder map

```
dueboard/
├── src/                     ← all extension code (only code here is built)
│   ├── ui/                  ← interface (most UI changes happen here)
│   │   ├── tokens.css       ← global colors, fonts, spacing
│   │   ├── components/      ← small pieces: Header, buttons, banners…
│   │   ├── views/           ← screens: course cards, calendar, to-do…
│   │   ├── hooks/           ← React hooks (logic; ask before changing)
│   │   └── i18n.tsx         ← every piece of text shown in the interface
│   ├── entrypoints/         ← page entry points: dashboard, popup (toolbar), options (settings)
│   ├── core/                ← core logic: time, due dates, merge rules
│   ├── connectors/          ← code that reads Brightspace / Gradescope / Pearson
│   ├── background/ sync/ syllabus/ capture/ storage/ diagnostics/   ← background sync and more
│   └── assets/              ← icons
├── tests/                   ← automated tests, same layout as src/ (add tests when you change src/)
├── design/                  ← mockups and UI drafts not yet in the code (not built)
├── docs/                    ← website pages, guides, design decisions
│   ├── team/                ← team handbook (this folder)
│   ├── guide/               ← install, publishing and other how-tos
│   └── superpowers/         ← feature design documents and implementation plans
├── store/                   ← Chrome / Firefox store listings and screenshots
├── scripts/                 ← end-to-end test scripts
├── .github/                 ← issue/PR templates, CI, code owners
└── CHANGELOG.md             ← what changed in each version
```

The root holds only configuration files (`package.json`, `wxt.config.ts`, …) and documentation. **No code in the root.**

## Versions

- The version number is `version` in `package.json`; changes are recorded in `CHANGELOG.md`.
- Only Raymond changes the version and makes releases. Everyone else describes their change in the PR, and it is collected at release time.
- "Which version is current?" — always `main`.

## Issue labels (suggested; create them on GitHub)

| Label | Meaning |
|---|---|
| `bug` | Something is broken |
| `ui` | Interface / design |
| `feature` | New feature |
| `needs-review` | Waiting for Raymond |
| `blocked` | Stuck, needs someone else |

You can add a board under the repository's **Projects** (To do / In progress / In review / Done) and drag issues across it, so everyone sees who is working on what.
