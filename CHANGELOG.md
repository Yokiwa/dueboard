# Changelog

## 1.5.0 — 2026-11 (trial build)

- **Done or not, for the whole term**: Overdue now lists every past-due assignment, quiz and homework of the term, not only the last 7 days. Exams and calendar events still leave the page 7 days after their date
- **Work you handed in is ticked off automatically, with its score**: from Brightspace (your submission in an assignment folder, your gradebook grade, which is also how quizzes count), Gradescope (a score, "Submitted" or "No Submission"), Pearson MyLab (its "see score" answer) and other homework platforms (the page's own score or "Submitted" status, read in the background like due dates). A score of 0 alone does not count, since platforms show 0 for missing work
- **"Not sure"**: past-due work that nothing has said anything about stays in Overdue with a "Not sure" tag; tick it if you did it. DueBoard keeps checking (each page at most once a day, after three checks with no answer only on Refresh), and the tag goes away by itself once a source answers
- **You decide**: untick work DueBoard ticked and it stays unticked, whatever a later sync reads
- To-do's Overdue group shows the 3 most recently due items and "Show all N overdue"
- Finished work due in the last 14 days is read again once a day, so regrades show up
- The visit log in Diagnostics shows what each page said about whether the work was handed in
- No new permissions

## 1.4.9 — 2026-11 (trial build)

- **Pearson signs back in by itself (for real this time)**: the visit log showed DueBoard pressing Assignments on Pearson's course page and then closing the window on MyLab's launch address, one step before MyLab had signed the student in. A sign-in now ends only on a MyLab page itself, and the minimized window gives Pearson's slow course page up to a minute

## 1.4.8 — 2026-11 (trial build)

- **Pearson signs back in more reliably**: in the minimized window, a Pearson sign-in page that moves on to the next one while DueBoard is setting up no longer ends the attempt with an error; in the background, Pearson's page gets up to 35 seconds to show its Assignments link (the whole sign-in up to about a minute)
- **Refresh tries signing back in to Pearson or Gradescope at once**; automatic syncs still try at most every 6 hours
- When a sign-in does not get through, the visit log says what the page showed (or which error the window hit), so the cause can be found
- A course syllabus read from a Brightspace link (for example "Syllabus Quiz") is no longer read again on every sync: DueBoard kept the read but not the link's last-changed time, so the link always looked changed
- A syllabus page the minimized window read no longer sends its platform to the window for 7 days (only homework pages do)

## 1.4.7 — 2026-11 (trial build)

- **Faster syncs**:
  - A platform whose pages the background could not read but the minimized window could (WileyPLUS) now goes straight to the window for 7 days, instead of costing a background attempt of about 20 seconds per homework every time. Within one sync, after two such pages in a row the rest of that platform goes straight to the window too, so the first sync after installing is fast as well
  - Brightspace links that land on Gradescope (or Pearson) and show no due date are not opened again: DueBoard reads those platforms' dates directly
  - A page read in the background that shows no due date ends as soon as it has been read, instead of waiting out about 20 seconds

## 1.4.6 — 2026-11 (trial build)

- **No page read in the background can open a tab or window any more**: the hidden frames are now sandboxed without permission to open new windows, so the browser itself refuses, whatever way a page tries (1.4.4 and 1.4.5 caught specific ways only; Brightspace's launch page for an "open in a new window" tool still got through). Pages DueBoard can move into the frame are still read in the background; the others are read by the minimized window

## 1.4.5 — 2026-11 (trial build)

- **No more stray tabs, second part**: a launch page whose script clicks a link it never adds to the page (or one inside a web component, or sends it a click event) still opened a real tab in 1.4.4. The click itself is now caught, so the page opens inside the hidden frame

## 1.4.4 — 2026-11 (trial build)

- **No more stray tabs during a sync**: a tool your instructor set to "open in a new window" (for example Achieve / Macmillan) made Brightspace's launch page open a real tab in front of you while DueBoard read it in the background. Forms and links meant for a new window now open inside DueBoard's hidden frame, where the page is read without a window

## 1.4.3 — 2026-11 (trial build)

- **The dashboard always says what a sync is doing**, from start to end: "Fetching your courses and assignments from Brightspace…", then "Reading your course syllabi…", then "Reading 3 of 20 platform pages…". 1.4.2 showed "Synced" while syllabi were read, so a sync that had started on its own (after installing or updating) looked finished
- "Session expired" lines stay hidden for the whole run, until DueBoard has tried to sign back in

## 1.4.2 — 2026-11 (trial build)

- **Pearson signs back in by itself**: Purdue's Pearson link first shows "Access Pearson for D2L Brightspace", and MyLab only signs you in once its **Assignments** link is opened. DueBoard now presses that link (the only one it presses there) and waits for MyLab, in the background and, if needed, in the minimized window
- An "open in a new tab" link pressed in the minimized window opens in that window, also on pages that open an empty window first
- On update, DueBoard again forgets which platforms it could not read in the background and how often Pearson's sign-in failed

## 1.4.1 — 2026-11 (trial build)

- **Background reading works on Purdue's real launch pages**: Brightspace shows a platform inside its own launch page, and 1.4.0 only looked at the outer page, so every page fell back to the window. The hidden frame now reads the platform page inside it
- **Pearson signs back in by itself**: signing in to Pearson through Brightspace passes through several Pearson pages; DueBoard now waits until MyLab itself has loaded (1.4.0 stopped at the first Pearson page, so the session never came back)
- **Fewer windows**: a platform page read in the background that shows no due date is final; the window tries again only when the page was blank, asked to sign in, or needed an "Open assignment" click
- "Open Assignment" buttons that open a new window now open the assignment inside the hidden frame, also on pages that open an empty window first
- The dashboard says "Fetching your courses and assignments from Brightspace…" while the sync reads Brightspace, also for a sync it didn't start
- "Session expired" lines wait until the sync has ended, so they only appear when DueBoard could not sign back in by itself
- On update, DueBoard forgets which platforms 1.4.0 could not read in the background and tries them again

## 1.4.0 — 2026-11 (trial build)

- **Homework pages are read in the background**: DueBoard opens your Brightspace homework links in hidden frames inside the extension, three at a time, reads each due date and shows it as soon as it arrives. Normally no window or tab opens
- **A small minimized window only as a fallback**: pages that can't be read in a hidden frame are read in the minimized window in the same run, which then closes. Settings has a new checkbox to turn the window off
- **Automatic by default**: "Automatically, in the background" is the new default for reading platforms (existing "Only when I click Refresh" choices move to it once; "Never" stays)
- **No more "Allow" prompts for known platforms**: access to every platform site DueBoard knows is part of the install, so the banner now appears only for a site DueBoard doesn't know. The platform list covers more sites (Achieve, Connect, WebAssign, Top Hat, Perusall, Sapling and others)
- **"Log in to Brightspace" on the first-run page**: one button signs you in (or starts the sync if you already are) and brings you back to the dashboard, where the first sync starts
- **Faster**: a page that lists several homeworks with their dates (a course page with "HW11 … Due Nov 11") dates all of them from one visit
- Settings → Diagnostics shows a Mode column (Background or Window) in the visit log
- A homework on a site DueBoard doesn't know yet is opened once in a small minimized window to find out which site it is; DueBoard then asks you to allow that site (as in 1.2.4)
- While a page is read in a hidden frame, DueBoard removes the "do not embed" headers from that one hidden request; your own tabs are never affected
- On update, Chrome asks once to accept the new list of homework sites (DueBoard stays off until you accept); Firefox may ask in a similar way
- This trial build does not include the scores feature, which is still on its own branch. Firefox support for background reading is untested

## 1.2.4 — 2026-11

- **Course cards keep their place**: courses are sorted by code instead of by their next deadline, so ticking off work no longer reshuffles the page
- **Cards show the next 7 days**: unfinished work due in the next 7 days, soonest first; finished work moves to the bottom of the card. "Show next week" adds the following week's work
- **Overdue work is off the cards**: a small "N overdue" line opens the course, whose detail now groups work as Overdue, Upcoming, No due date and Completed
- Old homework no longer comes back as overdue: dates read from a title or a platform page more than 7 days ago are dropped like any other old item
- **Settings → Finished work on the Courses page**: keep finished work at the bottom of each card, or list it in a separate "Done this week" section

## 1.2.3 — 2026-11

- **Fewer visit windows on Refresh**: a due date read from a platform page is read again every 3 days while the due date is more than 3 days away, and daily in its last 3 days (it was daily for all). Most Refreshes now open no window. How pages are read is unchanged

## 1.2.2 — 2026-11

- **Firefox no longer gets stuck at "Reading 1 of N platform pages…"**: Firefox can keep DueBoard waiting forever while one of a page's frames is still loading. DueBoard now reads the frames that are ready and moves on, so the run finishes, the visit window closes and Gradescope is read again
- The visit log (Settings → Diagnostics) gets each page as soon as it's read, so it shows how far a run got

## 1.2.1 — 2026-11

- **Gradescope dates after a visit signs you in**: opening a homework link that ends up on Gradescope (DataMine's projects, for example) signs you in there; DueBoard now reads Gradescope again in the same run, so those assignments get their dates right away
- A Pearson or Gradescope sign-in visit that ends on a page DueBoard can't see is still followed by a re-read, which tells whether the sign-in worked
- The visit log shows the date read and the text it came from

## 1.2.0 — 2026-11

- **Homework links open as full pages**, like "Open in new window". Platforms don't show inside Brightspace's own frame (WileyPLUS shows a launcher there; Gradescope doesn't load at all), so DueBoard now opens each homework's Brightspace launch link as a page and waits through the platform's steps
- **Launchers that wait for a click**: on platform pages DueBoard may press one "open the assignment" button (Open, Launch, View assignment), never anything that starts, continues or submits work; an assignment meant for a new tab opens in DueBoard's hidden tab
- **Gradescope signs back in through Brightspace**: when Gradescope (or Pearson) is signed out and any of your courses has its entry, DueBoard opens that entry once and reads Gradescope again, so every course's Gradescope assignments get their dates
- The visit log (Settings → Diagnostics) also shows the button pressed and, for pages without a date, a short text sample and their buttons

## 1.1.3 — 2026-11

- **Homework is opened even when its Brightspace link doesn't reveal the platform.** Purdue's launch links don't say which site they go to ahead of time, so 1.1.2 skipped every homework. DueBoard now opens each homework's own Brightspace page (as you would) and reads the frames of the platforms you allowed. Bare launch links whose site is unknown are still never opened
- The visit log says why a link's site couldn't be told
- **Settings button** on the dashboard and in the toolbar popup
- After updating, homeworks the previous version couldn't read are tried again on the next Refresh

## 1.1.2 — 2026-11

- **Platform pages are opened only when you click Refresh** (by default), so no window appears on its own; Settings can make it automatic again
- **Due dates written in homework titles** ("HW11 (10.3, 12.1)_due_Nov 11", "Set #05, Due Oct 02") are used when Brightspace has no date, marked "Date from title"; those homeworks are never opened in the visit window
- Documents named like "Assignments and due dates" are read like a syllabus
- **Visit log** in Diagnostics (Settings → Diagnostics): what each platform visit saw, step by step, to download and send when a date isn't read. It stays on your computer

## 1.1.1 — 2026-11

- **Homework embedded in a Brightspace page is read.** Some courses (for example WileyPLUS in PHYS 172) give several homeworks the same platform link, which only reaches the course page; DueBoard now opens each homework's own Brightspace content page, the way you do, and reads the assignment embedded in it
- After updating, homeworks the previous version found no date on are read again right away

## 1.1.0 — 2026-11

- **Due dates from any homework platform.** For homework that Brightspace launches on another platform (WileyPLUS, ALEKS, InQuizitive, WebAssign, Connect, Achieve and others, including ones DueBoard doesn't know), DueBoard opens the Brightspace link in a minimized window, reads the page's "Due …" line and closes it. It never clicks or submits anything. New homework is read once, and dates are rechecked daily. Settings: "Automatically", "Only when I click Refresh" or "Never"
- **Platform access asked per platform.** A bar names the platforms found in your courses and asks to allow reading their due dates; access can be removed in Settings
- **Pearson stays signed in.** When the Pearson session expires, DueBoard reopens it through Brightspace and reads it again, instead of asking you to
- **Syllabus suggestions.** Dated work found in your syllabus (Simple Syllabus, or a PDF or web page in Content) appears under "From syllabus" in the to-do list and course details, with Add and Hide
- **Firefox version** (Firefox 140 or newer), built from the same code; coming to Firefox Add-ons
- Every date read on a platform page says where it came from ("Read from ALEKS")
- Two syncs that overlap (for example a page load and a Refresh click) now share one run

## 1.0.2 — 2026-11

- Homework launched from Brightspace content is now found for any platform, not only known ones: numbered work (HW 3, Project #2, Lab 5, Quiz 4, Problem Set 1…), "Chapter 7 Quiz"-style titles, and every launch inside a Homework or Assignments module. Platform home pages, practice copies, solutions and registration links are left out
- Clearer extension description in Chrome's extensions list
- New illustrated install guide: https://yokiwa.github.io/dueboard/install.html

## 1.0.1 — 2026-11

- Sign-in prompts for Gradescope and Pearson now open the platform through your course in Brightspace (the way Purdue courses reach them), falling back to the platform's own sign-in page only when no course links it
- A course's Gradescope shortcut uses the Gradescope link in its Brightspace content when there is one

## 1.0.0 — 2026-11

First public release.

- Dashboard page opened from the toolbar: course cards, calendar (week / month) and to-do views, plus a "Next deadline" banner with a live countdown, *Open* and *Done* buttons
- Sign in to Brightspace only; DueBoard discovers each course's homework platforms from its content
- Reads Brightspace assignments, quizzes, calendar events, dated content items and homework launches
- Reads Gradescope assignments, due dates and submission status
- Reads Pearson MyLab assignments and due dates for courses that link to Pearson
- Notes WileyPLUS due dates when an assignment page is opened
- Shortcut buttons for Gradescope, Pearson, WileyPLUS, Achieve, WebAssign, McGraw-Hill Connect, Cengage, zyBooks, Piazza and Ed
- Tick items done (stays ticked in place), add assignments and links by hand
- Lecture and recitation sections of one course share a card; non-course Brightspace entries are hidden by default
- Settings: show / hide courses, course colors, merge Gradescope courses
- Toolbar popup with the next deadline and upcoming work; developer tools to export a page for adding new platforms
- All data stays in the browser
