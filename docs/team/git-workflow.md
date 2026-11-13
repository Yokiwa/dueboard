# Working with GitHub Desktop (no command line)

Download: https://desktop.github.com and sign in with your GitHub account.

## First time: get the repository on your computer

*File → Clone repository → Yokiwa/dueboard → Clone*. Then run `npm install` once in the repository folder (needs Node.js 22).

## Every time you start (most important!)

1. Top left, under **Current branch**, choose `main`.
2. Click **Fetch origin**, then **Pull origin**. → Your computer now has the latest version.
3. **Current branch → New branch**, name it `ui/xxx`, `fix/xxx`, `feat/xxx` or `docs/xxx` (depending on the work), based on `main`.
4. Edit the files in `src/` with your editor (VS Code).

## When you are done

1. GitHub Desktop lists the changed files on the left. Write a one-line summary below them (e.g. `ui: new Header style`) and click **Commit**.
2. Click **Publish branch** (later it says **Push origin**).
3. Click **Create Pull Request**, fill in the template in the browser (screenshots for UI changes) and submit.
4. Wait for CI to turn green ✅ and for Raymond's review. To make changes, keep committing and pushing on the same branch; the PR updates itself.

## You worked for a long time and `main` has moved on

*Branch → Update from main*. If there are conflicts, GitHub Desktop offers to open them in VS Code; keep what is needed, then Commit.

## If you can only upload through the website

Don't upload to the root. Follow rule 3 in [design/README.md](../../design/README.md): upload to `design/incoming/date-name/`, and at the bottom of the upload page choose **Create a new branch** (not commit to main), then open a PR.
