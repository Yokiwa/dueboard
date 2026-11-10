# Changelog

## 1.3.0 — 2026-11

- **Scores next to Done and Submitted**: finished work shows its score in the badge, for example "Done · 18/25" or "Submitted · 92%". Hover for where it came from
- Scores come from Brightspace's gradebook, from Gradescope's course page and from Pearson MyLab (through the same "see score" request the page makes), and from the platform pages DueBoard already opens: on Refresh it re-reads the page of finished work for a line like "18 / 25 points". Progress such as "Question 3/10" is never taken as a score
- Scores stay in your browser; no new permissions

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
