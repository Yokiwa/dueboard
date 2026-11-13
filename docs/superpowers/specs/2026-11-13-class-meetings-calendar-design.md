# Class meetings in the calendar, and a week view laid out by time — design

Date: 2026-11-13 · Status: written from the conversation with the maintainer, awaiting approval · Issue: #29

## 1. Why

DueBoard exists so a student sees every piece of work they have to hand in, and opens it in one click. Class
meetings posted in the Brightspace calendar ("Lec21", "Lec22" at 10:20 AM) show up among that work: on course cards,
in To-do, in the counts. They are not work. The maintainer wants them only in the calendar (#29), and the calendar's
week view laid out by time of day, in the spirit of a student timetable app (Coursicle was the reference given),
without getting cluttered.

## 2. Goals, non-goals, anti-goals

Goals
- Class meetings never appear where work is listed: To-do, course cards, course detail, Done this week, the next
  deadline banner, the "due in 48 h" and "this week" counts, the popup, the calendar's Due row, the month view.
- Class meetings appear in the calendar's week view as time blocks, at their real times.
- The calendar's main content stays the work: every day's assignments are visible at the top of the week view without
  scrolling (the maintainer chose layout A).

Non-goals
- Importing Purdue's class schedule, or letting the student type in class times. Classes are shown only when a course
  posts them in its Brightspace calendar.
- Class meetings in the popup, notifications, or any count.

Anti-goals (a failure even if it technically works)
- A lecture still listed as work anywhere, counted as overdue, or marked "Not sure".
- Real work hidden because it was taken for a class: an exam, a presentation, a reading or a deadline posted as a
  calendar event must stay work.
- A week view where assignments sit at the bottom of a scroll (most are due at 11:59 PM) or where class blocks hide
  them.

## 3. What counts as a class meeting

A Brightspace calendar event that is **not** linked to an assignment or quiz (linked ones are already skipped) is a
class meeting when either:
1. its title names a meeting: `lecture(s)`, `lec`, `lect` (alone or followed by a number: "Lec21", "LEC 22",
   "Lect. 3"), `recitation(s)`, `office hour(s)`, `class meeting`/`class session`, `discussion section`, `seminar`; or
2. it is timed and has a length: not all-day, `EndDateTime` after `StartDateTime` by 20 minutes to 4 hours, and its
   title has no deadline word (due, homework/hw, assignment, quiz, exam, midterm, final, project, essay, report,
   paper, platform names), and no exam word.

When a title has both: a meeting word with a work word (due, homework/hw, assignment, quiz, project, essay, report,
paper) is **work** ("Lecture 5 Quiz"); with exam or midterm it is an **exam** ("Lecture: Midterm Exam"); with only
"final" it is a **meeting** ("Lecture 14: Final Review"). *(Builder's call, approved with this document.)*

Kept as work exactly as today: deadline-like events (start = end, or a deadline word in the title), exams (exam words,
even when timed: "Midterm Exam 2, 7–9 PM"), all-day reading events (#20's rule). Days off ("no class", "break",
"holiday") stay dropped, as today. The work rule from #20 (a description that assigns reading or writing) no longer
applies to class meetings: "Lec21" with "Read Ch. 5" in its description is a class meeting, and so is a timed event
of class length whose description names a reading (the reading is shown with the class, in the calendar). *(Builder's
call.)*

A meeting keeps: course, title, start, end, and its Brightspace link (the event page, else the course calendar), as
the event "Open" link works today.

## 4. Approaches considered

Where meetings are kept
- A new item type `class` among the work items. Least code, but every consumer of items (To-do, cards, counts,
  overdue, completion checks, background page visits, the next deadline) would have to exclude it; one miss and
  lectures leak back. Rejected.
- **A separate list, read only by the calendar. Chosen.** The Brightspace snapshot gains `meetings`; the dashboard
  builds `Dashboard.meetings` for visible current courses; no other code sees them.

How the week view is drawn
- A calendar library (e.g. FullCalendar): faster, but a large dependency that needs restyling for the four themes.
  Rejected.
- **Extend the existing hand-written calendar. Chosen.** No new dependency; themes apply as they do today.

Where 11:59 PM work goes (maintainer's choice: **A**)
- **A: a "Due" row at the top of each day lists that day's work with its time; the time grid below holds only class
  meetings.** Chosen.
- B: work at its real time, 11:59 PM work folded into a "due tonight" block at the bottom. Not chosen.

## 5. The week view (part 2)

```
        Sun 15     Mon 16          Tue 17     Wed 18          …
 Due              ● HW 7 11:59 PM             ● Quiz 8 11:59 PM     ← work, course color, done struck through
                  ● Lab 8  5:00 PM                                     overdue in the urgent style
 ───────────────────────────────────────────────────────────────
  9 AM            ┌──────────┐               ┌──────────┐
                  │CS 180 Lec21│             │CS 180 Lec22│         ← class block, light course color,
 10 AM            └──────────┘               └──────────┘           height = its length
 11 AM
```

- Due row: the same chips as today (course dot, title, time, done/overdue styles), all of the day's work, no limit.
- Time grid: hours from the earliest meeting start that week (rounded down) to the latest end (rounded up); at least
  8 AM to 6 PM. Blocks are placed by minutes. Meetings that overlap share the column side by side. A line marks the
  current time on today's column.
- A week without any class meeting shows the Due row only and no grid (no empty hours).
- Clicking a block opens the meeting's Brightspace page. Blocks show the course code and title; the full time range
  is in the tooltip.
- Narrow windows: the 7 columns keep a minimum width and the grid scrolls sideways inside the calendar card, not the
  page.
- Month view: work only, as today (no classes).
- Brightspace's calendar is read 7 days back to 60 days ahead (unchanged), so weeks outside that range show no
  classes.

## 6. Parts and order (one pull request each)

1. **Fix #29 (fix/):** classify meetings (section 3), keep them in `snapshot.meetings`, out of every work list; show
   them in the current calendar's week view for now as simple chips with a time range in the light course color
   (never in the month view).
   Close #29 once merged.
2. **Week view by time (ui/):** section 5. Month view unchanged.

## 7. Data and compatibility

- `RawMeeting { source: 'brightspace'; sourceId: string; sourceCourseId: string; title: string; startAt: string;
  endAt: string; url: string }`; `Snapshot.meetings?: RawMeeting[]` (Brightspace only).
- `Dashboard.meetings: Meeting[]` with `{ id, courseId, title, startAt, endAt, url }`, for visible current courses.
- A store from 1.5.0 has old "Lec" items in its snapshot; the next sync replaces the snapshot, so they disappear.
  Leftover records about them (completion, ticks) are harmless and unused.
- No new permissions. New interface text: the Due row's label ("Due"), in `src/ui/i18n.tsx`. A week without classes
  shows no grid and no message.

## 8. Testing

- Classification: "Lec21" with a reading description → meeting; "Lecture" 50 min → meeting; "Lecture 14: Final
  Review" → meeting (title names a meeting); "Midterm Exam 2" 7–9 PM → exam; "Project presentation" 10:30–11:20 →
  work; a reading all-day event → work; "WebAssign 14.3 due" (start = end) → work; "No class" → dropped; an event
  linked to a dropbox → skipped as today.
- Dashboard: meetings are in `Dashboard.meetings` and in no item list, count or next deadline; hidden or past courses'
  meetings are not shown.
- Week view: Due row holds all of a day's work; block position and height from start/end; overlaps side by side;
  grid range; no grid in a week without meetings; month view has no meetings.
- End to end (mock sites): a "Lec" event with a reading description is in the calendar and not in To-do or the
  course card.

## 9. Left to the builder

Exact colors and spacing within the existing theme tokens; the hour row height; tooltip wording; how the current-time
line looks.
