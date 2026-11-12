# Firefox Add-ons (AMO) listing

Copy each section into the matching field when submitting. See `docs/guide/05-firefox.md` for the steps.

## Name
DueBoard

## Add-on URL
dueboard

## Summary (max 250 characters)
Every assignment and deadline from Brightspace and the homework platforms your courses use, on one page. Sign in to Brightspace once; DueBoard finds the rest.

## Description
Stop clicking through every course in Brightspace and opening platform after platform to find due dates. Sign in to Brightspace once. DueBoard reads your courses, finds the homework platforms they use, and puts every deadline on one page, one click from your toolbar.

<b>What you get</b>
• One sign-in: Brightspace is the only account you connect
• Next deadline: the nearest deadline on top with a live countdown, Open and Done buttons
• Course cards with upcoming work and shortcuts to each course's platforms
• Calendar (week and month) and a to-do list: work you handed in is ticked off automatically with its score; Overdue lists every past-due item of the term, and anything DueBoard can't tell is marked "Not sure"
• Due dates, scores and submission status from Brightspace (including your gradebook), Gradescope and Pearson MyLab, read in the background
• Due dates from other homework platforms: DueBoard opens the homework link from Brightspace in a hidden frame inside the extension, reads the "Due" line (and, for past-due work, whether the page shows a score or "Submitted") and closes it, automatically, in the background where the page allows it, otherwise in a small minimized window (which you can turn off in Settings).
• Syllabus suggestions: dated work found in your syllabus, to add with one click
• Add your own entries for anything else

<b>Privacy</b>
Everything stays in your browser. Nothing is uploaded, collected or analyzed, and DueBoard never sees your password. It only reads pages. The one thing it may press is a platform's "open the assignment" button (Open, Launch, View assignment); it never types, and never starts, continues or submits work.

Currently works with Purdue University's Brightspace (purdue.brightspace.com).
DueBoard is an open-source student project and is not affiliated with Purdue University, D2L, Mozilla or any homework platform it reads.

## Categories
Productivity (also: Other)

## Tags
students, deadlines, homework, brightspace, calendar

## Support
- Support website: https://github.com/Yokiwa/dueboard/issues
- Homepage: https://yokiwa.github.io/dueboard/

## License
MIT

## Privacy policy
https://yokiwa.github.io/dueboard/privacy.html

## Notes for reviewers
Build: `npm ci && npm run zip:firefox` (Node 20+). Output: `.output/firefox-mv3/`.
The UNSAFE_VAR_ASSIGNMENT warnings are in bundled React DOM and pdf.js (pdf.worker.min.mjs ships unmodified from pdfjs-dist); DueBoard never writes innerHTML.
Known homework platform sites are granted at install through `host_permissions`. The optional host permission `https://*/*` is used only for a site DueBoard does not know: it is requested one site at a time, after a click on an "Allow" button that names that site. It lets DueBoard read the due date on that site's assignment pages and, for past-due work, whether the page shows it handed in. When a page cannot be read in a hidden frame, DueBoard uses a minimized window it opens and closes itself; in that window only, it may press the page's one "open the assignment" button, and `window.open` is redirected to the same tab so an assignment meant for a new tab opens there.
Hidden-frame reading: DueBoard embeds the student's own homework pages (reached through their Brightspace links) in hidden frames inside its background page, and reads the due date. Homework platforms forbid embedding, so while DueBoard is reading, one `declarativeNetRequestWithHostAccess` session rule removes the `X-Frame-Options` and `Content-Security-Policy` response headers from page loads inside DueBoard's own hidden frames (requests that belong to no browser tab) on the homework sites it has access to; it never applies to the student's tabs, and it is removed when reading ends.
Access to the known platform sites is declared in `host_permissions` (granted at install); any other site uses the optional permission above. The due-date reader is a content script on those sites that stays silent in a normal tab and only answers the extension's own frame host. Pages that cannot be read in a frame fall back to a minimized window (a Settings checkbox turns this off).
Firefox: background reading is unverified until a tester has run it; the visit log in Settings → Diagnostics shows whether each page was read in "Background" or "Window" mode.
