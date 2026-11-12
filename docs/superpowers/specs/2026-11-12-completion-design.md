# DueBoard 1.5.0: done or not, scores, and every overdue item of the term — design

Date: 2026-11-12 · Status: approved in conversation, awaiting review of this document · Target version: 1.5.0

## 1. Goal

DueBoard knows, for each piece of work the student has to hand in this term, whether it is done, shows its score when
it is, and lists every past-due item that is not done — not only those of the last 7 days.

Success:

- Every item in Overdue is work the student has not handed in, or work DueBoard could not check, marked "Not sure".
  Work the student handed in is not in Overdue.
- Work a platform reports as submitted, or that has a score, is ticked off automatically and shows its score.
- Reading stays in the background wherever possible. A minimized window opens only for platforms that can be read no
  other way (WileyPLUS today), and only until each item's state is known.
- A wrong "done" is worse than "Not sure": nothing is marked done or not done unless the source says so clearly.

Decided with the user:

- Implementation approach 1: port the 1.3.0 score work onto the 1.4 architecture (hidden frames first, minimized window
  as fallback), extended to completion. The `feat/scores` branch is not merged as is.
- A score or a "submitted" state marks work done automatically (choice A).
- Check until known; finished work due in the last 14 days is re-checked daily for regrades; older finished work is not
  re-read (choice A).
- To-do's Overdue group shows the 3 most recently due items and "Show all N overdue" (choice A).
- Only work that is handed in counts: Brightspace assignments and quizzes, platform homework, and the student's own
  entries. Calendar events and exams leave the page 7 days after their date, as now (choice A).
- Unknown past-due work stays in Overdue with a "Not sure" tag; the student can tick it (choice A, from the 1.4 talks).

Not in this version: colors by score, averages or course totals, scores for unfinished work.

## 2. Which items take part

- Items of current courses (the existing `isCurrent` rule) whose type is `assignment`, `quiz` or `manual`, including
  platform homework launched from Brightspace (type `assignment`).
- Their window starts at the course's start (`courseTerm(course, now).start`: the Brightspace start date, or the
  semester guess when Brightspace has none) instead of 7 days ago. Items without a due date are unchanged.
- `exam` and `event` items keep the 7-day rule. So do dates from calendar events.
- The Brightspace calendar request keeps its range (7 days back, 60 ahead); dropbox folders and quizzes already return
  the whole course.

## 3. States

```ts
type Completion =
  | { state: 'done'; by: 'submitted' | 'score'; source: string; score?: Score; evidence?: string; at: string }
  | { state: 'not_done'; source: string; evidence?: string; at: string }
  | { state: 'unknown' };
```

What the student sees, per item:

| State | When | Where |
|---|---|---|
| Upcoming | Not due yet, not done | As now |
| Done (automatic) | A source reports it submitted or scored | Completed, e.g. "Done · 18/25" |
| Done (ticked) | The student ticked it | Completed |
| Overdue | Past due, and a source says it was not handed in | Overdue, no tag |
| Overdue · Not sure | Past due, and nothing has said whether it was handed in | Overdue, "Not sure" tag |

Rules:

1. **The student decides.** A tick (`userState.done`) marks done. Un-ticking work DueBoard marked done records
   `userState.notDone[key]`; such an item is never auto-marked done again (it is Overdue or Upcoming by its date, with
   no "Not sure" tag). Ticking it again clears `notDone`.
2. **"Not sure" resolves itself:** a later "submitted" or score makes it done; a later "not handed in" removes the tag.
3. Done items are never in Overdue. Course detail's Completed section lists the term's done work with scores.
4. A course card's "N overdue" counts all of the term's overdue work, "Not sure" included.
5. The student's own entries (`manual`) have no source to check: past due and not ticked, they are Overdue without a
   "Not sure" tag.

Precedence when sources disagree, for one item: the student's choice; then any `done` (submitted or score — a score
proves the work was taken); then `not_done`; else `unknown`. A Brightspace item merged with a platform item
(`isSameWork`) combines the sources of both.

## 4. Where the state and score come from

All results are stored per item key in a new store key `completion: Record<itemKey, CompletionRecord>`, which survives
syncs (snapshots are rebuilt every sync, so they cannot hold what was learned over several syncs).

```ts
interface CompletionRecord {
  state: 'done' | 'not_done' | 'unknown';
  by?: 'submitted' | 'score';
  source?: string;        // 'Brightspace', 'Gradescope', 'Pearson', a platform label
  score?: Score;          // from 1.3.0: { text, earned?, possible?, from, evidence? }
  evidence?: string;      // the page or API text it was decided from
  checkedAt: string;      // last time any source answered for this item
  tries?: number;         // page checks in a row that found no answer
}
```

### 4.1 Brightspace dropbox submissions (no window)

- Today: `mySubmissions` is asked only for folders due between 7 days ago and 30 days ahead.
- Now: also for every past-due folder of the term whose record is not `done`, most recently due first, at most 40
  folders per sync (the rest in later syncs). A folder known `done` is not asked again; one due in the last 14 days is
  re-asked once a day for its score only through the gradebook (4.2), not through `mySubmissions`.
- Answer with a submission or a completion date → `done, by: 'submitted', source: 'Brightspace'`. An answer with none →
  `not_done`. A failed request (group folders, 403) → no change.

### 4.2 Brightspace gradebook (no window)

- Ported from 1.3.0: one `myGradeValues` request per current course per sync; 403/404 means no gradebook scores.
- Matching by grade item id (folders and quizzes carry `GradeItemId`), else by unique normalized name within the
  course; ambiguous names are skipped.
- A released grade with points or a displayed grade → `done, by: 'score'` with the score. This is how quizzes become
  done (quiz attempts are not readable by students).

### 4.3 Gradescope (no window; already read every sync)

- `.submissionStatus--score` → `done, by: 'score'` with the score (ported from 1.3.0).
- "Submitted" without a score → `done, by: 'submitted'`.
- "No Submission" → `not_done`.

### 4.4 Pearson MyLab (no window; already read every sync)

- The 1.3.0 "see score" callback (at most 10 per sync, two at a time, 10 s each), now for every past-due row whose
  record is not `done`, plus rows due in the last 14 days once a day. A score → `done, by: 'score'`.
- A cell already holding a score is read directly.

### 4.5 Platform pages (hidden frame, then window)

See section 5.

### 4.6 How often

- Unknown and past due: each source above answers every sync it runs (they cost no window). Platform pages: at most
  once a day per item; after 3 page checks in a row with no answer (`tries`), only on Refresh.
- Done, due in the last 14 days: score re-read once a day (gradebook every sync anyway; Pearson and platform pages
  daily).
- Done, due more than 14 days ago: not re-read.
- Not due yet: as now (Brightspace and Gradescope report submitted early work; no page visits for completion).

## 5. Reading completion on platform pages

- **Which items:** past-due platform homework (a Brightspace topic with a launch link) whose record is `unknown` or
  missing, and done items due in the last 14 days (for regrades). Not: quizzes and exams (`NEVER_OPEN`), Gradescope and
  Pearson (reader `fetch`), items without a launch link, items the student marked `notDone` or ticked done.
- **How:** a new visit mode `check`, through the 1.4 visit pass: hidden frame first, minimized window as fallback, the
  learned "window only" platforms straight to the window, the same "open the assignment" button rule (never Start,
  Continue, Submit). An item that also needs its due date is read once in mode `due` with completion reading switched
  on, not visited twice.
- **Limits:** at most 15 `check` targets per sync, counted with the due-date visits against the existing limits
  (`MAX_VISITS`, `WINDOW_MAX`); due-date targets are scheduled first.
- **Reading (strict):**
  - Score: the 1.3.0 `findScore` rules (a labeled score only: "Score: 18/25", "Grade 92%", "Points 7.5/10").
  - Done: a status word in a status context: "Submitted", "Completed", "Turned in", "Graded" as a label or badge text
    of its own (a short element, at most a few words), not inside sentences such as "will be graded".
  - Not done: "Not submitted", "Not started", "No submission", "Not attempted" as their own short element.
  - Anything else: no answer (`tries + 1`).
- The reader answers `{ type: 'visitCheck', state, score?, evidence, frameUrl }`; the frame host and the window runner
  handle it like `visitFound`. The visit log shows the result and its evidence.

## 6. Interface

- **To-do:** the Overdue group lists past-due, not-done items, most recently due first; only the first 3 are shown,
  then a button "Show all N overdue" (and "Show fewer"). "Not sure" items carry a small neutral tag with the hint
  "DueBoard couldn't tell whether you've done this — tick it if you have."
- **Done badges:** "Done · 18/25", "Submitted · 92%" (1.3.0 format); the hint says where it came from ("Score from
  Gradescope", "Brightspace shows it as submitted").
- **Undo an automatic done:** in course detail's Completed section the item's tick can be cleared; that records
  `notDone` (rule 1).
- **Course card:** "N overdue" counts the term's overdue work; course detail lists all of it in Overdue and the term's
  done work in Completed.
- **Calendar:** past days show the term's work: done in the muted style, overdue in the urgent style. Exams and events
  older than 7 days are not shown, as now.
- Unchanged: the "due this week" number, the next-deadline banner, "Done this week" (automatic done counts as done).

## 7. Updating from 1.4.9

- No new browser permissions (the gradebook and Pearson's callback are on hosts already granted), so Chrome does not
  disable DueBoard on update.
- `completion` starts empty. The first syncs after updating fill it gradually (40 Brightspace folders and 15 platform
  pages per sync), so older overdue items may show "Not sure" until they have been checked.
- `forgetUnfoundVisits` and `forgetVisitMemory` behave as in 1.4.

## 8. Testing and review

- Unit tests for every rule: precedence, the student's override and its undo, "Not sure" resolving both ways, the
  14-day regrade window, `tries` and Refresh, the term window per type, the 40/15 limits and their order, each source's
  parsing (dropbox answers, gradebook matching, Gradescope statuses, Pearson callback, page reading with and without
  labels and in sentences).
- End-to-end (real Chromium, mock sites): Brightspace folders handed in and not, a gradebook score for a quiz,
  Gradescope "No Submission", a Pearson score, a mock WileyPLUS page showing "Score: 18/25" and one showing nothing,
  an automatic done un-ticked by the student and not re-ticked by the next sync, Overdue collapsed to 3.
- A final full review after implementation: every changed file read again against this design, edge cases checked on
  purpose (a course without start date, items without due dates, the same work on two platforms, a sync cut short,
  a failing source), and a list of what was found and fixed given to the user.

## 9. Docs and release

- Privacy policy and store listing: DueBoard reads the student's own gradebook scores and completion states from
  Brightspace and the platforms, on their computer only; the "check" visits are read-only like due-date visits.
- Version 1.5.0, changelog, Chrome and Firefox builds for the user's trial before the store upload.
