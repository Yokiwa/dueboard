# Class meetings in the calendar, and a week view by time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> For this plan: inline execution (superpowers:executing-plans), no subagents.

**Goal:** Class meetings from the Brightspace calendar leave every work list and appear only in the calendar, whose week view becomes a "Due" row above a time grid of classes.

**Architecture:** The Brightspace connector sorts plain calendar events into work, class meetings or nothing; meetings travel in their own `meetings` list (connector result → snapshot → `Dashboard.meetings`), which only the calendar reads. Part 2 rebuilds the calendar's week view from that list with layout helpers in `calendarGrid.ts`.

**Tech Stack:** WXT 0.21 MV3, TypeScript, React 19, Tailwind 4, date-fns, Vitest + happy-dom, Playwright e2e (`scripts/e2e-frames.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-13-class-meetings-calendar-design.md`

## Global Constraints

- Follow `AGENTS.md`: each part on its own branch from the latest `main`; a pull request per part; only the maintainer merges.
- Part 1 branch `fix/class-meetings-in-calendar` (spec and this plan travel with it); part 2 branch `ui/calendar-week-by-time`, created from `main` after part 1 is merged.
- English only in the repo; all interface text in `src/ui/i18n.tsx`; no new dependencies; no new permissions; do not change `package.json` version or `CHANGELOG.md`.
- Meeting words: `lecture(s)`, `lec`, `lect` (alone or with a number: "Lec21", "LEC 22", "Lect. 3"), `recitation(s)`, `office hour(s)`, `class meeting`, `class session`, `discussion section`, `seminar`.
- Duration rule: not all-day, end 20 minutes to 4 hours after start, no deadline word and no exam word in the title.
- Mixed titles: meeting word + work word (due, homework/hw, assignment, quiz, project, essay, report, paper) → work; + exam/midterm → exam; + only "final" → meeting.
- Days off ("no class", "break", "holiday") stay dropped; events linked to a dropbox or quiz stay skipped.
- Week view (part 2): "Due" row on top with all of a day's work; grid from the earliest meeting start (rounded down to the hour) to the latest end (rounded up), at least 8 AM–6 PM; no grid in a week without meetings; month view never shows meetings.
- Each part ends with `npm run compile && npm test` passing and `npm run e2e:frames` passing.

## Review Focus

- A title-rule meeting without `EndDateTime` (e.g. "Lecture" with only a start): it is still a meeting, 50 minutes long (Task 1 test `a lecture without an end lasts 50 minutes`).
- An all-day event titled "Lecture": not work and not placeable in the grid, so it is dropped (Task 1 test `an all-day lecture is dropped`).
- Meetings of hidden or past courses: not shown (Task 2 test `meetings of hidden courses are not in the dashboard`).
- Three meetings overlapping in one day (lecture, recitation, lab section at the same hour): side by side, none hidden (Task 5 test `three overlapping meetings share the column in thirds`).
- A meeting running past midnight: drawn on its start day, cut at the day's end (Task 5 test `a meeting past midnight is cut at the end of its day`).

---

## Part 1 — fix #29 (`fix/class-meetings-in-calendar`)

### Task 1: Sort calendar events into work, meetings or nothing

**Files:**
- Modify: `src/connectors/brightspace/map.ts` (`toEventItem`, `MEETING_WORDS`, `describesWork`; add `classifyEvent`, `toMeeting`), `src/core/types.ts` (add `RawMeeting`)
- Test: `tests/connectors/eventFilter.test.ts`

**Interfaces:**
- Produces: `interface RawMeeting { source: 'brightspace'; sourceId: string; sourceCourseId: string; title: string; startAt: string; endAt: string; url: string }` in `src/core/types.ts`; `classifyEvent(ev: CalendarEvent): 'work' | 'meeting' | 'drop'`; `toMeeting(ev: CalendarEvent, base: string): RawMeeting | null` (`sourceId` = `event:<CalendarEventId>`, `url` as `eventUrl`); `toEventItem` returns `null` for anything `classifyEvent` does not call `work`.

- [ ] **Step 1: Write the failing tests** (plain events unless stated; times UTC in the fixtures' style):
  - `Lec21 with a reading in its description is a meeting, not work` — `{ Title: 'Lec21', Start 14:30, End 15:20, Description: 'Read Ch. 5 pg. 121-139' }` → `classifyEvent` `'meeting'`, `toEventItem` `null`, `toMeeting` `{ title: 'Lec21', startAt, endAt, sourceId: 'event:<id>' }`.
  - `LEC 22, Lect. 3 and Lecture (50 min) are meetings`.
  - `Lecture 14: Final Review is a meeting; Lecture: Midterm Exam is an exam; Lecture 5 Quiz is work` (`toEventItem(...).type` `'exam'` / `'event'`).
  - `a 50-minute event without a deadline word is a meeting` — "Zarathustra discussion" 14:30–15:20 → `'meeting'`.
  - `Midterm Exam 2, 7–9 PM stays an exam`; `Project presentation 10:30–11:20 stays work`; `WebAssign 14.3 due (start = end) stays work`; `an all-day reading event stays work` (the #20 fixture).
  - `No class stays dropped`; `an event linked to a dropbox stays skipped`.
  - `a lecture without an end lasts 50 minutes` — "Lecture", Start 14:30, End null → meeting ending 15:20.
  - `an all-day lecture is dropped` — "Lecture", `IsAllDayEvent: true` → `'drop'`, `toMeeting` `null`.
- [ ] **Step 2:** `npx vitest run tests/connectors/eventFilter.test.ts` — Expected: FAIL (`classifyEvent` missing).
- [ ] **Step 3: Implement** in `map.ts`: `MEETING_WORDS` gains `lec`/`lect` (with optional dot and number), `class meeting`, `class session`, `discussion section`, `seminar`; days-off words move to their own `DAYS_OFF` (dropped). `classifyEvent` order: linked dropbox/quiz → `drop`; days off → `drop`; meeting word in title → work word → `work`, exam/midterm → `work` (exam), else (all-day → `drop`, else `meeting`); timed 20 min–4 h, no deadline or exam word → `meeting`; existing work rules (`DEADLINE_WORDS`, `describesWork`, linked entity) → `work`; else `drop`. Add `IsAllDayEvent?: boolean` and `Description?` to `CalendarEvent` if missing.
- [ ] **Step 4:** Run the same file — Expected: PASS; `npx vitest run tests/connectors` — Expected: PASS.
- [ ] **Step 5:** Commit `fix(brightspace): class meetings in the calendar are not work (#29)`.

### Task 2: Meetings travel to the dashboard on their own

**Files:**
- Modify: `src/core/types.ts` (`ConnectorResult` ok branch and `Snapshot` gain `meetings?: RawMeeting[]`; add `Meeting`), `src/connectors/brightspace/index.ts` (collect `toMeeting` results in the calendar loop), `src/sync/runSync.ts` (save `meetings`), `src/core/dashboard.ts` (`Dashboard.meetings`)
- Test: `tests/connectors/brightspace.test.ts`, `tests/core/dashboard.test.ts`, `tests/sync/runSync.test.ts` (or wherever `saveSnapshot` is asserted)

**Interfaces:**
- Consumes: `RawMeeting`, `toMeeting` (Task 1).
- Produces: `interface Meeting { id: string; courseId: string; title: string; startAt: string; endAt: string; url: string }`; `Dashboard.meetings: Meeting[]` sorted by `startAt`, only for visible courses (`id` = `brightspace:<sourceId>`, `courseId` through the same alias map items use).

- [ ] **Step 1: Write the failing tests:**
  - Connector: `calendar meetings come back in meetings, not items` — fixture calendar with "Lecture" (14:30–15:20) → `result.meetings` has it, `result.items` has no `event:` item for it.
  - runSync: `the snapshot keeps the connector's meetings`.
  - Dashboard: `meetings are in Dashboard.meetings and in no item list` — a snapshot with one meeting → `dash.meetings.length === 1`, no item with its id, `nextDue` not it, `dueCounts` unchanged.
  - Dashboard: `meetings of hidden courses are not in the dashboard`.
  - Dashboard: `a store without meetings gives an empty list`.
- [ ] **Step 2:** Run the three files — Expected: FAIL.
- [ ] **Step 3: Implement** as in the Interfaces; meetings use the course alias/visibility rules items use, and no date window (the calendar request already limits them to −7…+60 days).
- [ ] **Step 4:** `npx vitest run` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: class meetings reach the dashboard in their own list`.

### Task 3: The current calendar shows meetings in the week view

**Files:**
- Modify: `src/ui/views/CalendarView.tsx`, `src/ui/views/calendarGrid.ts` (`meetingsByDay`)
- Test: `tests/ui/calendar.test.tsx`

**Interfaces:**
- Consumes: `Dashboard.meetings` (Task 2).
- Produces: `meetingsByDay(meetings: Meeting[]): Map<string, Meeting[]>` (local day of `startAt`, sorted by start).

- [ ] **Step 1: Write the failing tests:** `the week view shows a meeting under the day's work as "CS 180 · Lec21 9:30–10:20 AM", linking to its page`; `the month view shows no meetings`; `To-do and course cards never show meetings` (render `TodoView` and `CourseCard` with a dashboard holding one meeting: its title absent).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement:** in week mode, after the day's work chips, a `MeetingChip` (light course color background, `data-kind="meeting"`, time range `h:mm–h:mm a`, `title` tooltip with the full title and range). Month mode unchanged.
- [ ] **Step 4:** `npx vitest run tests/ui` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(calendar): class meetings in the week view`.

### Task 4: End to end, docs, pull request

**Files:**
- Modify: `scripts/e2e/mock-sites.cjs` (background scenario `myEvents`: when `state.meetings`, a plain "Lec21" event tomorrow 9:30–10:20 local time with Description "Read Ch. 5"), `scripts/e2e-frames.cjs`, `README.md` (calendar line, if it lists what the calendar shows)

- [ ] **Step 1:** Add the check: after a sync with `state.meetings`, "Lec21" is not on the course card nor in To-do, and the Calendar tab's week view shows it.
- [ ] **Step 2:** `npm run compile && npm test && npm run e2e:frames` — Expected: all pass, "e2e frames: all checks passed".
- [ ] **Step 3:** Commit `test(e2e): class meetings stay out of work lists`; push; open the PR (template, before/after screenshots of a course card with Lec21 and the calendar week, `Closes #29`). Tell the user it waits for the maintainer.

---

## Part 2 — the week view by time (`ui/calendar-week-by-time`, from `main` after part 1 is merged)

### Task 5: Layout of a week's meetings

**Files:**
- Modify: `src/ui/views/calendarGrid.ts`
- Test: `tests/ui/calendarGrid.test.ts`

**Interfaces:**
- Produces: `weekHours(meetings: Meeting[], days: Date[]): { from: number; to: number } | null` (hours 0–24; `null` when no meeting falls in `days`; at least 8–18); `layoutDay(meetings: Meeting[], day: Date): { meeting: Meeting; top: number; height: number; col: number; cols: number }[]` (`top`/`height` in minutes from midnight, cut to the day; overlapping meetings share `cols`).

- [ ] **Step 1: Write the failing tests:** `no meetings in the week gives no grid`; `range is 8–18 for a 9:30–10:20 class, 7–20 for 7:30 and 19:15–19:45`; `a 9:30–10:20 class is at 570 minutes, 50 tall`; `two overlapping meetings get col 0 and 1 of 2`; `three overlapping meetings share the column in thirds`; `back-to-back meetings (10:20 end, 10:20 start) do not overlap`; `a meeting past midnight is cut at the end of its day`.
- [ ] **Step 2:** `npx vitest run tests/ui/calendarGrid.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement:** overlap groups = runs of meetings whose spans chain together; within a group, greedy first free column; `cols` = the group's column count.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(calendar): layout of a week's class meetings`.

### Task 6: Week view = Due row + time grid

**Files:**
- Modify: `src/ui/views/CalendarView.tsx` (week mode only), `src/ui/i18n.tsx` (`cal.due`: "Due")
- Test: `tests/ui/calendar.test.tsx`

**Interfaces:**
- Consumes: `weekHours`, `layoutDay` (Task 5), `meetingsByDay`, `itemsByDay`.

- [ ] **Step 1: Write the failing tests:** `the week view has a Due row with every one of the day's work items` (5 items on one day, all shown); `class blocks sit in the grid at their time with the course code and title, linking to their page`; `a week without meetings has no grid`; `today's column has a current-time line when the grid covers now`; `the month view is unchanged and has no meetings`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement:** week mode renders the 7-column header, then a "Due" row (the existing `Chip`s), then, when `weekHours` is not null, an hour gutter and 7 columns positioned by `layoutDay` (1 px per minute × a row-height factor; blocks absolutely positioned, `left = col/cols`, `width = 1/cols`, showing course code and title, the full title and time range in the `title` tooltip); the current-time line on today's column. Keep the existing `min-w-[980px]` horizontal scroll. Remove Task 3's in-cell meeting chips from week mode.
- [ ] **Step 4:** `npx vitest run tests/ui` — Expected: PASS.
- [ ] **Step 5:** Commit `ui(calendar): week view with a Due row and a class time grid`.

### Task 7: Check in the browser, pull request

- [ ] **Step 1:** Build, screenshot the calendar week (with classes, and a week without) in the four themes; compare with `main`.
- [ ] **Step 2:** `npm run compile && npm test && npm run e2e:frames` — Expected: all pass (update the Task 4 calendar check to the grid if its selector changed).
- [ ] **Step 3:** Push, open the PR with before/after screenshots; tell the user it waits for the maintainer.
