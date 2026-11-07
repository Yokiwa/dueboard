# Changelog

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
