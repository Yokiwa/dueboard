# Contributing (read this first)

The problem we had: one person fixed bugs on the new version while another built UI on an old version, and the two no longer fit together.
These rules prevent that. **The core rule: whoever you are and whatever you work on, every time start a new branch from the latest `main`, and merge back into `main` through a pull request.**

## 1. Team

| Person | GitHub |
|---|---|
| Raymond (maintainer: owns the rules, CI and versions; makes releases) | @Yokiwa |
| Kaiyi | @ricecooker669 |
| VNzia | @VNzia |

**Roles change; the process does not.** Who does what this time is whoever the issue is assigned to. Anyone can fix bugs, work on UI or add features, and the steps are the same.
Folder guide: [docs/team/README.md](docs/team/README.md).

## 2. Every piece of work

1. **Start with an issue.** Open one in GitHub Issues (there are templates) and assign it to whoever is doing it.
2. **Create a new branch from the latest `main`.** The prefix depends on **what the work is**, not on who does it:
   - Bug fix: `fix/short-description`, e.g. `fix/pearson-login`
   - UI / design: `ui/short-description`, e.g. `ui/header-redesign`
   - New feature: `feat/short-description`
   - Docs only: `docs/short-description`
3. **Change and commit on that branch.** Only change what the issue is about.
4. **Open a pull request into `main`** and write `Closes #<issue number>` in the description. UI changes must include before/after screenshots.
5. **Wait for Raymond to review and merge it.** Every PR into `main` needs Raymond's (@Yokiwa) approval, and only Raymond merges. Don't merge it yourself and don't enable auto-merge. Make CI green; if GitHub says the branch is out of date, click **Update branch**.
6. The branch is deleted after merging. Next time, go back to step 2 and **branch again from the latest `main`**.

### Raymond's approval

Every PR needs it ([.github/CODEOWNERS](.github/CODEOWNERS) lists Raymond for every file). GitHub asks Raymond for review automatically and blocks the merge until Raymond approves. Be extra careful with the files that control the project:

- `.github/` (CI, templates, code owners)
- `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` (the rules)
- `package.json`, `package-lock.json`, `CHANGELOG.md` (versions and dependencies)

Writing code with Codex, Claude or another AI? [AGENTS.md](AGENTS.md) in the repository root is read by the AI automatically, and it follows this process on its own.

Not comfortable with the command line? See [docs/team/git-workflow.md](docs/team/git-workflow.md) — a few clicks in GitHub Desktop.

## 3. Don'ts

- ❌ Don't push or upload files directly to `main`.
- ❌ Don't put `.tsx` / `.ts` / `.css` files in the repository **root**. The build only reads `src/`, so files in the root do nothing (and CI fails).
- ❌ Don't keep building new work on an old branch. Sync with `main` before you start.
- ❌ Don't fix a bug and redesign UI in the same PR. Make two PRs.

## 4. When two people change the same file

- UI work and bug fixes most often meet in `src/ui/`. Before you start, say in the issue which files you will change.
- If the PR says "This branch has conflicts": merge the latest `main` into your branch (GitHub Desktop: *Branch → Update from main*), resolve the conflicts, then push. If unsure, @ the other person in the PR and look at it together.

## 5. Check before you push

```bash
npm install
```

```bash
npm run compile && npm test
```

For UI changes, also run `npm run dev` and look at it in the browser.
