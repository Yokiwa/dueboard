# Instructions for AI coding agents (Codex, Claude Code, etc.)

> 给 AI 编程助手（Codex 等）的规则。每次在这个仓库干活都必须遵守。人类请看 [CONTRIBUTING.md](CONTRIBUTING.md)。

This repository is worked on by several people at once. `main` is the only source of truth for the current version. Follow these rules on **every** task, without being reminded.

## 1. Before you change anything: start from the latest `main`

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c <type>/<short-description>
```

- Use `fix/...` for bug fixes (e.g. `fix/pearson-login`) and `ui/...` for UI/design work (e.g. `ui/header-redesign`); `feat/...` for new features, `docs/...` for docs only.
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
- At the end, tell the user: the branch name, that it was based on the latest `main`, and the result of `npm run compile` and `npm test`.
