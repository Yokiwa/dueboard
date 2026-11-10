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
• Calendar (week and month) and a to-do list
• Due dates from Brightspace, Gradescope and Pearson MyLab, read in the background
• Due dates from other homework platforms: when you click Refresh, DueBoard opens the homework link from Brightspace in a minimized window, reads the "Due" line, and closes it. You allow each platform once.
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
Optional host permission `https://*/*` is requested one site at a time, only after a click on an "Allow" button that names the homework platform found in the student's courses. It lets DueBoard read the due date on that platform's assignment pages, in a minimized window DueBoard opens and closes itself. In that window only, DueBoard may press the page's one "open the assignment" button, and `window.open` is redirected to the same tab so an assignment meant for a new tab opens there.
