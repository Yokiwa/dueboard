# Chrome Web Store listing

Copy each section into the matching field when uploading.

## Name
DueBoard

## Summary (max 132 characters)
Every deadline from Brightspace and the homework platforms your courses use, on one page.

## Category
Productivity › Education

## Language
English

## Description
Stop clicking through every course in Brightspace and signing in to platform after platform. Sign in to Brightspace once — DueBoard reads your courses, finds the homework platforms they use, and puts every deadline on one page, one click from your toolbar.

• One sign-in: Brightspace is the only account you connect
• Next deadline: the nearest deadline on top with a live countdown, Open and Done buttons
• Course cards: upcoming work per course, plus one-click shortcuts to the homework platforms each course uses
• Calendar: a week view with what is due each day on top and your class times below, and a month view that shows which days pile up
• To-do list: work you handed in is ticked off automatically, with its score, when Brightspace or the platform shows it; Overdue lists every past-due item of the term, and anything DueBoard can't tell is marked "Not sure" for you to tick
• Due dates, scores and submission status from Brightspace (including your gradebook), Gradescope and Pearson MyLab, read in the background
• Due dates from other homework platforms: DueBoard opens your Brightspace homework link in a hidden frame inside the extension, reads the "Due" line (and, for past-due work, whether the page shows a score or "Submitted") and closes it, automatically and without opening a window or tab. Pages that can't be read that way keep their last known dates.
• Syllabus suggestions: dated work found in your syllabus, to add with one click
• Add your own: anything DueBoard can't read can be added by hand
• Syncs every 30 minutes using the sessions already in your browser

Privacy: everything stays in your browser. Nothing is uploaded, collected or analyzed, and DueBoard never sees your password.

Currently works with Purdue University's Brightspace (purdue.brightspace.com).
DueBoard is an open-source student project and is not affiliated with Purdue University, D2L or any homework platform it reads.

## Screenshots (1280×800)
store/screenshots/1-courses.png, 2-calendar.png, 3-todo.png

## Privacy practices

### Single purpose
Show the student's own assignments, deadlines and course resource links from Brightspace and the homework platforms its courses use, in one dashboard page.

### Permission justifications
- storage: keep synced assignments, the user's own entries and choices on this device.
- alarms: re-sync assignments and deadlines in the background every 30 minutes.
- offscreen: parse Gradescope, Pearson and syllabus pages and PDFs in the background (service workers cannot parse HTML or run the PDF reader's worker). Reason DOM_SCRAPING: the offscreen page also embeds the student's own assignment pages, reached through their Brightspace homework links, in hidden frames, to read the due date; the pages are only read, never changed, and the frames are removed afterwards.
- declarativeNetRequestWithHostAccess (homework platforms forbid being embedded): while DueBoard is reading, one session rule removes the `X-Frame-Options` and `Content-Security-Policy` response headers from page loads inside DueBoard's own hidden frames (requests that belong to no browser tab) on the homework sites it has access to; it never applies to the student's tabs, and it is removed when reading ends.
- activeTab, scripting: only when the user clicks “Export this page” in the popup, read the current tab and save it as a local file to help add support for another homework platform.
- Host permission https://purdue.brightspace.com/*: read the user's own courses, assignments, quizzes, calendar, course content listing, their own submissions (handed in or not) and their own gradebook grades.
- Host permission https://www.gradescope.com/*: read the user's own courses, assignments, due dates and submission status.
- Host permission https://socket.pearsoned.com/*: only when Pearson MyLab reports the student signed out, open Pearson's sign-in gateway (reached from the student's own Brightspace link) inside DueBoard's hidden frame and press its "Open Pearson" button, which signs the student back in to MyLab. It never types, and reads nothing on that page.
- Host permission https://mylab.pearson.com/*: only when one of the user's courses links to Pearson MyLab, read the assignment list, due dates and the student's own scores (the same read-only "see score" request the page sends).
- Host permissions, one per homework platform site (https://*.aleks.com/*, https://*.wileyplus.com/*, https://*.wwnorton.com/*, https://*.webassign.com/*, https://*.macmillanlearning.com/*, https://*.mheducation.com/*, https://*.cengage.com/*, https://*.zybooks.com/* and the other platform sites listed in the extension's permissions): read the due date on the student's own assignment pages and, for past-due work, whether the page shows it handed in (a labeled score or a status such as "Submitted"). The same permissions let the due-date reader run in the hidden frames that show these pages.
- Content script on https://education.wiley.com/*: when the user opens a WileyPLUS assignment, read only its title and due-date line so the dashboard can show that deadline; never clicks or changes anything.
- Content script on the homework platform sites above, all frames, page world, at document start (Chrome): does nothing unless the frame is inside DueBoard's own hidden frames (its top page is the extension's page). There, a link, form or window.open that would open a new tab opens inside the hidden frame instead, so no tab appears in front of the student. It never reads, sends or changes anything else. The hidden frames are also sandboxed without permission to open windows or tabs.
- Signing back in: when Gradescope or Pearson MyLab reports the student signed out, DueBoard opens that platform's entry in one of the student's Brightspace courses (at most every 6 hours, or on Refresh). Pearson's entry shows its course page first; there DueBoard presses only its "Assignments" link, which signs the student in to MyLab. It never presses anything else on that page.
- Optional host permission https://*/*: never granted at install. When DueBoard finds a homework platform in the user's Brightspace courses that is not in the list above, it names the site and asks for access to that site only, on the user's click ("Allow"). With it, DueBoard reads the assignment page's heading and due-date line the same way, in a hidden frame; it never opens a window or tab. On a platform page that waits for a click, it may press that page's one "open the assignment" button (Open, Launch, View assignment); it never types, and never presses anything that starts, continues or submits work. Access can be removed in DueBoard's Settings.

### Remote code
No remote code. All code ships inside the extension package.

### Data usage
- Data type: "Website content" (the user's own course and assignment information, used only locally).
- Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness.
- Privacy policy URL: https://yokiwa.github.io/dueboard/privacy.html
