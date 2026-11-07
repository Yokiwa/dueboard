# DueBoard implementation decisions

Where the plan was silent or a judgment call was needed during the first implementation, a decision was made and development continued. Each entry lists the reason and what it costs if the call was wrong. Later product changes are recorded in the design document's change log.

## 1. Decisions that affect what students see

| # | Decision | Reason | Cost if wrong |
|---|---|---|---|
| 1 | "N this week" counts unfinished items due in the **next 7 days**, not Monday–Sunday; overdue items are not counted | Matches the rolling feel of the mockup and stays meaningful on weekends | On weekends the number differs from the calendar week |
| 2 | Course colors are assigned by course code and don't follow card order | Card order changes daily; colors must not | None |
| 3 | Items on two platforms with the same title in the same course, due within 1 hour, merge into one; *Open* prefers Gradescope | Design §4.6 | The merged time may differ by up to an hour |
| 4 | Two items from the **same platform** never merge (e.g. "Homework 3" and "Homework 3 - Programming"). Exception: a Brightspace calendar event merges with the assignment it mirrors | The final review found the second item disappeared | A hand-made calendar event titled like an assignment and within an hour of it is hidden behind it |
| 5 | Brightspace assignments or quizzes with no Due Date but an End Date use the End Date | The final review found many instructors only set an End Date | Occasionally the close time shows instead of a separately agreed due time |
| 6 | Brightspace calendar events are kept only if they look like deadlines (whole words like due, HW, quiz, exam, project, report), and events mirroring assignments or quizzes already read are skipped | Otherwise weekly lectures and lab sections flood the list | An oddly titled deadline event is missed (can be added by hand) |
| 7 | Calendar events with exam / midterm / final in the title are typed as exams | Allows showing exams separately later | None |
| 8 | Shown range: everything due after 7 days ago, plus undated items | Design §4.6 | None |
| 9 | If one endpoint fails for a course, the rest of that course still shows; the failed part keeps the last good data and the card says "Some data did not sync" | The final review found one failure hid the whole course | None |
| 10 | "Sign in again" only for account-level failures; a 403 for one course marks it partial | The final review found false sign-in prompts | None |
| 11 | A failing Brightspace calendar request is silent | The calendar is a bonus source; assignments and quizzes cover most deadlines | Calendar-only deadlines can go missing without a notice |
| 12 | Items the platform reports as submitted are ticked and locked | The platform already confirmed submission | None |
| 13 | In the to-do list, ticked items stay in their group until their due time passes, then fold into a collapsed "Completed" section | Unfinished work stays prominent | None |
| 14 | A hand-added assignment without a link opens the course's Brightspace home; both forms accept only http(s) URLs | Safety, and every item opens somewhere | None |
| 15 | The welcome guide shows until any platform has synced once | Install triggers a sync, so "never synced" is not a reliable signal | None |
| 16 | The toolbar popup shows the next deadline and the next 5 unfinished items (not overdue ones) | The popup is small | Overdue items are only in the full dashboard |
| 17 | Settings list hidden courses too; an automatic code match cannot be undone yet | Keeps the first release simple | A wrong automatic match can only be hidden |
| 18 | When courses merge, hand-added items, links, colors and hidden flags follow | The final review found they were lost | None |
| 19 | Each card shows one shortcut per platform; course-website links are de-duplicated by URL | Some courses link Pearson dozens of times | A second distinct link to the same platform is hidden (still in Brightspace) |
| 20 | The calendar opens in week view; month view shows up to 3 items per day plus "+N" | Week view reads more clearly | None |
| 21 | Fonts are bundled; nothing loads from Google Fonts | The privacy promise: no third-party requests | None |
| 22 | Settings open in a full tab | There are many settings | None |
| 23 | Dates include the year when it differs from this year | "Jan 12" seen in November is ambiguous | None |

## 2. Technical decisions (no visible effect)

| # | Decision | Cost if wrong |
|---|---|---|
| 24 | WXT's `init` failed on a GitHub rate limit; the configuration was written by hand | None — equivalent setup |
| 25 | Development continued before the real-account check, assuming background requests with the browser's cookies work | One file (`http.ts`) to change — it turned out to work |
| 26 | The diagnostics sign-in check uses `whoami` (`/versions/` is public) | None |
| 27 | Exported samples have Gradescope CSRF tokens removed | None |
| 28 | Gradescope is probed at `/account`; the Brightspace calendar request passes all current course IDs | A URL fix once real data arrived — it did not need one |
| 29 | First Brightspace and Gradescope fixtures were written from documentation, then checked against real data | Parser tweaks if the real data differed |
| 30 | Gradescope rows without an assignment ID get an ID from their title; a page with a login form counts as signed out | A renamed assignment loses its tick |
| 31 | Gradescope course name = short name + full name | None |
| 32 | Syncs fetch platforms in parallel and write results one after another so they can't overwrite each other | None |
| 33 | "Needs a sync" uses each platform's last *attempt*, not last success | After a failure, up to 5 minutes before the automatic retry (Refresh works anytime) |
| 34 | During a sync the background makes a cheap call every 20 s so the browser doesn't stop it | One tiny call every 20 s while syncing |
| 35 | Page parsers may answer synchronously or asynchronously (the background parses via an offscreen document) | None |
| 36 | UI text goes through a `useT()` hook | None |
| 37 | Component details: DueBadge takes the current time; AppShell is layout only; `useStore` and small setters added | None |
| 38 | Item titles are links; platform shortcuts sit in a "Shortcuts" group; course details open from the title button | None |
| 39 | Views sort a course's items by due date themselves (defensive) | None |
| 40 | The course details dialog opens with `showModal()` only (the screenshot check found the backdrop missing) | None |
| 41 | Store screenshots are exactly 1280×800; the website has its own stylesheet with dark mode | None |
| 42 | GitHub links used a placeholder until the account existed (now `Yokiwa`) | None |

Some extra tests (diagnostics, background message routing, every storage helper) were added beyond the plan so that all code is covered.

## 3. Known minor issues (deferred)

1. Brightspace "quickLink" launches without a platform name in the title can't be labeled with that platform
2. Changing a color in Settings while ticking an item elsewhere can, very rarely, drop one of the two changes
3. If browser storage can't be read, the page is blank instead of showing an error
4. Old offerings without an end date may keep showing (hide them in Settings)
5. A Gradescope course with no assignments may be flagged "Some data did not sync"
6. Brightspace quizzes can't be detected as submitted; finished quizzes show "Overdue" for up to 7 days unless ticked
7. For up to a minute after a deadline passes, the banner can still show 00:00:00
8. Accessibility details: arrow-key navigation for the view tabs and calendar; month view "+N" is not clickable
9. The offscreen document used for parsing is not closed after a sync
