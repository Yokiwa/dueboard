# Guide 02: Help add a homework platform

DueBoard learns a new homework platform from a real page. If your course uses a platform whose due dates DueBoard doesn't show, you can export a sample page and send it to the developer.

## Export a page

1. Open the platform page that lists your assignments and their due dates (for example Pearson's *Assignments* page).
2. Click the DueBoard icon in Chrome's toolbar.
3. Expand **Developer tools** at the bottom and click **Export this page**. A file named `dueboard-page-<site>.html` is downloaded.

## Export course links

To show which links DueBoard found in your Brightspace courses, click **Export course links** in the same section. A file named `dueboard-links.json` is downloaded.

## Check before sending

DueBoard removes emails, hidden form values and session tokens, but a page may still show your name.

1. Open the file in a text editor.
2. Search (Ctrl+F / ⌘+F) for your first name, last name, student ID / career account and email.
3. Replace anything you find with `[REDACTED]`.

Then attach the file to a [GitHub issue](https://github.com/Yokiwa/dueboard/issues) or send it to the developer.

## Diagnostics page

**Settings → Diagnostics** has three buttons for troubleshooting:

1. **Check access** — whether DueBoard can read Brightspace and Gradescope with your current sign-in.
2. **Export sample data** — one sample of every Brightspace and Gradescope response DueBoard uses, with personal data removed (check it as above before sending).
3. **Sync now** — runs a sync and shows how many courses, items and links each platform returned.
