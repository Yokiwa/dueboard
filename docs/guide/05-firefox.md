# Guide 05: Firefox

DueBoard's Firefox version comes from the same code as the Chrome version. It is listed publicly on Firefox Add-ons
(addons.mozilla.org, "AMO"), so people install it with one click and Firefox keeps it up to date.

## Build

```bash
npm run zip:firefox
```

This writes two files to `.output/`:

- `dueboard-<version>-firefox.zip`: the add-on you upload.
- `dueboard-<version>-sources.zip`: the source code. AMO asks for it because the add-on is built with tools (TypeScript, Vite).

Check it first:

```bash
npm run lint:firefox
```

Expected: `errors 0`. The `UNSAFE_VAR_ASSIGNMENT` warnings come from bundled libraries: React (its `dangerouslySetInnerHTML` support) and Mozilla's pdf.js (used to read syllabus PDFs; its worker file ships unmodified). DueBoard's own code never writes `innerHTML`. You can mention this in the reviewer notes.

## Test it in Firefox before submitting (about 5 minutes)

The build environment can't run Firefox, so do this check once on a real computer before the first submission.

1. Open Firefox (version 140 or newer) and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `manifest.json` inside the unzipped `dueboard-<version>-firefox.zip`. (A temporary add-on is removed when Firefox closes. That's expected.)
3. Sign in to Brightspace (purdue.brightspace.com) in a normal tab.
4. Click the DueBoard toolbar icon → **Open full dashboard** → **Start sync** (or **Refresh**).
5. Check:
   - [ ] Your courses appear as cards. This is the important one: it proves Firefox lets DueBoard use your Brightspace sign-in.
   - [ ] If you use Gradescope: its assignments appear.
   - [ ] Background reading: refresh homework and confirm that no tabs or windows open. Diagnostics should show new visits as "Background". Failed reads retain existing dates and may require signing in yourself. A successful Firefox build alone does not establish compatibility with each platform. Download the visit log when a platform cannot be read.

   - [ ] A banner asking to allow a platform appears only for a site DueBoard does not know. Known platforms are allowed when the add-on is installed.
   - [ ] No error banner stays on the dashboard.
6. If courses don't appear, open `about:debugging` → DueBoard → **Inspect**, copy the messages from the **Console** tab, and send them to the developer.

## Create an AMO account

1. Go to https://addons.mozilla.org/developers/ and sign in with a Firefox account (free; create one with your email).
2. Accept the developer agreement. Use your name or `DueBoard` as the display name.

## Submit

1. **Submit a New Add-on** → **On this site** (a public listing).
2. Upload `dueboard-<version>-firefox.zip`. Choose **Firefox** (desktop). Android is optional.
3. **Source code:** answer **Yes** and upload `dueboard-<version>-sources.zip`. In the notes for reviewers, write:
   > Build: `npm ci && npm run zip:firefox` (Node 20+). Output: `.output/firefox-mv3/`. The innerHTML warnings are in bundled React DOM and pdf.js (pdf.worker.min.mjs ships unmodified from pdfjs-dist); DueBoard never writes innerHTML.
4. **Listing:** copy each field from `store/firefox-listing.md`. Upload the screenshots in `store/screenshots/`.
5. **Privacy policy:** https://yokiwa.github.io/dueboard/privacy.html
6. **Data collection:** DueBoard collects none. The manifest already declares this (`data_collection_permissions: none`).
7. Submit. Automated review usually finishes within minutes to a day. A human reviewer may look later and ask questions by email.

## After approval

- The listing URL looks like `https://addons.mozilla.org/firefox/addon/dueboard/`. Send it to the developer so the install page can show an **Add to Firefox** button.
- **Updates:** for each new version, run `npm run zip:firefox` and upload the new zip (and sources zip) under **Manage My Submissions → DueBoard → Upload New Version**. Firefox updates installed copies automatically.
