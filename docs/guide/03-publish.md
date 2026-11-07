# Guide 03: Publish on GitHub and the Chrome Web Store

## 1. GitHub (done)

The code lives at https://github.com/Yokiwa/dueboard, and GitHub Pages serves the website from the `main` branch's `/docs` folder:

- Website: https://yokiwa.github.io/dueboard/
- Privacy policy: https://yokiwa.github.io/dueboard/privacy.html

### Publish a release

1. Open https://github.com/Yokiwa/dueboard/releases/new.
2. **Choose a tag** → type the version (for example `v1.0.0`) → **Create new tag on publish**, target `main`.
3. Title: `DueBoard 1.0.0`. Description: copy the matching section of `CHANGELOG.md`.
4. Attach `dueboard-1.0.0-chrome.zip` (built with `npm run zip`, found in `.output/`).
5. **Publish release**.

If a tag with that name already exists on an older commit, delete the old release and tag first: **Releases → the release → Delete**, then **Tags → the tag → Delete**.

## 2. Chrome Web Store developer account

1. Open https://chrome.google.com/webstore/devconsole and sign in with a Google account.
2. Accept the developer agreement and pay the one-time **US $5** registration fee.
3. Verify your email. The publisher name is public; use your name or `DueBoard`.

## 3. Upload (start as Unlisted)

1. In the developer console, click **New item** and upload the release zip.
2. **Store listing:** fill in name, summary, description, category and language from `store/listing.md`; upload the screenshots in `store/screenshots/`. The icon comes from the zip.
3. **Privacy practices:** fill in each field from the "Privacy practices" section of `store/listing.md`; the privacy policy URL is the GitHub Pages link above.
4. **Distribution:** set visibility to **Unlisted** — only people with the link can install. Good for the beta.
5. **Submit for review.** The first review usually takes a few days. The result arrives by email.
6. Once approved, share the store link with beta testers.

## 4. Go public

When the beta is stable (see Guide 04):

1. Developer console → **Distribution** → visibility **Public** → save and submit.
2. Point the "Add to Chrome" buttons in `README.md` and `docs/index.html` to the store listing.

## 5. Ship updates

1. Bump `version` in `package.json` (for example 1.0.1), update `CHANGELOG.md`, run `npm run zip`.
2. Developer console → the item → **Package** → upload the new zip → submit for review.
3. Users' browsers update automatically after approval.
4. Publish a matching GitHub release.

## Optional: Microsoft Edge Add-ons

Register at https://partner.microsoft.com/dashboard/microsoftedge (free) and upload the same zip, listing and screenshots.
