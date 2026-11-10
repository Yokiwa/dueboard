# Chrome Web Store listing

Copy each section into the matching field when uploading.

## Name
DueBoard

## Summary (max 132 characters)
Every deadline from Brightspace and the homework platforms your courses use (Gradescope, Pearson, WileyPLUS, ALEKS…) on one page.

## Category
Productivity › Education

## Language
English

## Description
Stop clicking through every course in Brightspace and signing in to platform after platform. Sign in to Brightspace once — DueBoard reads your courses, finds the homework platforms they use, and puts every deadline on one page, one click from your toolbar.

• One sign-in: Brightspace is the only account you connect
• Next deadline: the nearest deadline on top with a live countdown, Open and Done buttons
• Course cards: upcoming work per course plus shortcuts to Gradescope, Pearson, WileyPLUS, Achieve, Piazza, Ed and more
• Calendar: week and month views show which days pile up
• To-do list: tick work off; submitted work is ticked automatically where the platform reports it
• Due dates from Brightspace, Gradescope and Pearson MyLab, read in the background
• Due dates from other platforms (WileyPLUS, ALEKS, InQuizitive, WebAssign, Connect, Achieve and more): when you click Refresh, DueBoard opens your Brightspace homework link in a minimized window, reads the "Due" line and closes it. It also opens the pages of finished work to read their score. You allow each platform once.
• Syllabus suggestions: dated work found in your syllabus, to add with one click
• Add your own: anything DueBoard can't read can be added by hand
• Syncs every 30 minutes using the sessions already in your browser

Privacy: everything stays in your browser. Nothing is uploaded, collected or analyzed, and DueBoard never sees your password.

Currently works with Purdue University's Brightspace (purdue.brightspace.com).
DueBoard is an open-source student project and is not affiliated with Purdue University, D2L, Gradescope, Pearson, Wiley or any other platform it reads.

## Screenshots (1280×800)
store/screenshots/1-courses.png, 2-calendar.png, 3-todo.png

## Privacy practices

### Single purpose
Show the student's own assignments, deadlines, scores and course resource links from Brightspace and the homework platforms its courses use, in one dashboard page.

### Permission justifications
- storage: keep synced assignments, the user's own entries and choices on this device.
- alarms: re-sync assignments and deadlines in the background every 30 minutes.
- offscreen: parse Gradescope, Pearson and syllabus pages and PDFs in the background (service workers cannot parse HTML or run the PDF reader's worker).
- activeTab, scripting: only when the user clicks “Export this page” in the popup, read the current tab and save it as a local file to help add support for another homework platform.
- Host permission https://purdue.brightspace.com/*: read the user's own courses, assignments, grades, quizzes, calendar and course content listing.
- Host permission https://www.gradescope.com/*: read the user's own courses, assignments, due dates and submission status.
- Host permission https://mylab.pearson.com/*: only when one of the user's courses links to Pearson MyLab, read the assignment list and due dates, and the scores of assignments that show a see-score link, through the page's own see-score request.
- Content script on https://education.wiley.com/*: when the user opens a WileyPLUS assignment, read only its title and due-date line so the dashboard can show that deadline; never clicks or changes anything.
- Optional host permission https://*/*: never granted at install. When DueBoard finds a homework platform in the user's Brightspace courses, it names the platform and asks for access to that platform's site only, on the user's click ("Allow"). With it, DueBoard opens the user's own Brightspace homework link in a minimized window, reads the assignment page's heading and due-date line, and the score of finished work, and closes the window. On a platform page that waits for a click, it may press that page's one "open the assignment" button (Open, Launch, View assignment); it never types, and never presses anything that starts, continues or submits work. Access can be removed in DueBoard's Settings.
- scripting (with the optional access above): inject the read-only reader of the due date, and the score of finished work, into those assignment pages.

### Remote code
No remote code. All code ships inside the extension package.

### Data usage
- Data type: "Website content" (the user's own course and assignment information, used only locally).
- Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness.
- Privacy policy URL: https://yokiwa.github.io/dueboard/privacy.html
