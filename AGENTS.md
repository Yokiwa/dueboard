# Instructions for AI coding agents (Codex, Claude Code, etc.)

> Rules for AI coding assistants. Follow them every time you work in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md).

This repository is worked on by several people at once. `main` is the only source of truth for the current version. Follow these rules on **every** task, without being reminded.

## 1. Before you change anything: start from the latest `main`

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c <type>/<short-description>
```

- Pick the prefix from **what this task is**, not from who is asking (people switch roles): `fix/...` for bug fixes (e.g. `fix/pearson-login`), `ui/...` for UI/design work (e.g. `ui/header-redesign`), `feat/...` for new features, `docs/...` for docs only. Every task gets its own new branch from the latest `main`, every time.
- If the user's task was already started on a branch, first bring it up to date: `git fetch origin && git merge origin/main` (or rebase), resolve conflicts, then continue.
- Never build new work on an old branch or an old copy of the files. If you cannot fetch `origin/main`, stop and tell the user.

## 2. While working

- **Never commit or push to `main` directly.** All changes reach `main` through a pull request.
- Code lives only in `src/`; tests in `tests/` (mirroring `src/`). **Never put `.ts`, `.tsx`, `.js` or `.css` files in the repository root** — the build (`wxt.config.ts`, `srcDir: 'src'`) ignores them and CI fails.
- Edit the existing file in `src/` instead of creating a copy elsewhere. UI: `src/ui/` (`tokens.css`, `components/`, `views/`); all user-facing text goes in `src/ui/i18n.tsx`. Folder map: [docs/team/README.md](docs/team/README.md).
- One pull request does one thing. Do not mix a bug fix and a UI redesign in the same branch.
- Do not change `package.json` `version` or `CHANGELOG.md`; the maintainer does that at release time.

## 3. Before you finish

```bash
npm install
npm run compile
npm test
```

All must pass. For a bug fix, add or update a test in `tests/`. For UI work, also check it with `npm run dev`.

## 4. Finish with a pull request into `main`

- Push the branch: `git push -u origin <branch>`.
- Open a pull request into `main` using `.github/pull_request_template.md` (include `Closes #<issue>` and, for UI, before/after screenshots). If you cannot open the PR yourself, tell the user the branch name and ask them to open it on GitHub.
- No approval is needed for changes in `src/`, `tests/`, `design/` or `docs/`: once CI is green the PR can be merged by its author. Enable auto-merge on the PR if you can (`gh pr merge --auto --merge`, or the GitHub API); otherwise tell the user to click **Enable auto-merge** or merge it when CI passes. If GitHub says the branch is out of date with `main`, update it (`git merge origin/main`, push) and let CI run again.
- Do not merge a PR whose CI failed: fix the cause first. Never weaken, skip or delete tests or CI to get green.
- PRs touching `.github/`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `package.json`, `package-lock.json` or `CHANGELOG.md` need the maintainer's approval (see `.github/CODEOWNERS`). Avoid touching them unless the task requires it, and say so in the PR.
- At the end, tell the user: the branch name, that it was based on the latest `main`, and the result of `npm run compile` and `npm test`.

## 5. Building a package (zip) for someone to try

Other people merge into `main` all the time, so a zip built from your copy can already be out of date. Every time you build a zip (`npm run zip`, `npm run zip:firefox`) to hand to someone:

1. **Check the latest version first.** `git fetch origin`, then compare `git rev-parse HEAD` with `git rev-parse origin/main`. If they differ, update (`git switch main && git pull --ff-only origin main`, or `git merge origin/main` on a branch you are testing) and run `npm run compile` and `npm test` again.
2. **Build only from the latest `main`**, or from a branch you have just updated from it. Never from an old branch or an old copy of the files.
3. **Check again right before you hand it over.** If `origin/main` moved while you were building or testing, update, test and build again.
4. **Say what it is.** Tell the user the commit it was built from (`git rev-parse --short HEAD`), that this is the latest `main`, and the version in `package.json`. Zips with the same version have the same file name, so say which one is current.
