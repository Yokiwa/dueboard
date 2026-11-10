# DueBoard: assignment scores — design

Date: 2026-11-10 · Status: draft for review · Target version: 1.3.0

## 1. Goal

When a student's work is finished (marked Done, or reported Submitted by its platform), DueBoard shows its score next
to the "Done" / "Submitted" badge, in the format the source uses: "Done · 18/25", "Submitted · 92%".

Success:

- Scores appear for Brightspace's own work, Gradescope, and any platform whose grades reach the Brightspace gradebook.
- Platforms that do not send grades to Brightspace (for example WileyPLUS in some courses) get their score from the
  assignment page, read on Refresh in the existing minimized visit window.
- A wrong number is worse than no number: nothing is shown unless the source clearly labels it as a score.

Decided with the user:

- Scores only for finished work. Unfinished work shows no score, even when a platform shows a partial one.
- Every Refresh re-reads every finished item's score. There is no once-a-day limit and no try limit, and a found
  score is still re-read, so regrades show up.
- In the user's courses, only some instructors send platform grades to the Brightspace gradebook, so both the
  gradebook and the platform pages are needed.

Not in this version: scores for unfinished work, colors by score, and grade averages or course totals.

## 2. What a score is

```ts
interface Score {
  /** As the source shows it, trimmed: "18/25", "92%", "A-". */
  text: string;
  earned?: number;   // 18
  possible?: number; // 25
  /** Where it came from, for "Score from WileyPLUS". */
  from: string;      // 'Brightspace' | 'Gradescope' | a platform label
  /** The page or API text it was read from (visit log, hover). */
  evidence?: string;
}
```

`text` is normalized only lightly: "18.0 / 20.0" → "18/20", "1.5 / 25 points" → "1.5/25", "92 %" → "92%".
Trailing ".0" is dropped; other decimals stay.

## 3. Sources, in order of preference

An item takes the first source that has a score for it.

### 3.1 Brightspace gradebook (no window)

- During the Brightspace sync, one request per current course:
  `GET /d2l/api/le/{le}/{ou}/grades/values/myGradeValues/`. The response holds the grades released to the student:
  `GradeObjectIdentifier`, `GradeObjectName`, `PointsNumerator`, `PointsDenominator` and `DisplayedGrade`.
- A 403 or 404 (grades hidden in that course) is not an error. The course simply has no gradebook scores, and the
  rest of the sync is unaffected.
- **Matching to items:**
  - By grade item id when the Brightspace object carries one (assignment folders have `GradeItemId`; the
    connector starts reading it).
  - Otherwise by normalized name (the same `normalizeTitle` used for captured dates), and only when exactly one item
    in that course has that name and exactly one grade has it. Anything ambiguous is skipped.
- Grade values with no points and no displayed grade (not graded yet) are ignored.
- Text: `PointsNumerator/PointsDenominator` when both exist, else `DisplayedGrade` (for example "92 %" or "A-").

### 3.2 Gradescope course page (no window)

- `parse.ts` already finds `.submissionStatus--score` ("18.0 / 20.0") to mark work submitted. It now also keeps the
  score on the raw item.

### 3.3 Pearson MyLab (no window)

What the student's export of the "Homework and Tests" page (`DoAssignments.aspx`) shows:

- Each row's "Gradebook Score" cell is a `<div id="H_<assignmentId>_IVF_2_False">`. Before a click it holds a "see score"
  link that calls `WebForm_DoCallback('__Page', '<div id>', scoreCallBack, …)`. After the click it holds the score,
  for example `<span>100%</span>`.
- The callback answers `<type>_<assignmentId>_<IV flag>_<grade category>_<allow average>_<score>`, for example
  `H_729259668_IVF_2_False_100%`, and the page puts the last part into the cell.

What the connector does:

- It already fetches this page and finds each row's assignment id from `H_<id>`.
- It now also keeps each row's score-cell id and the page form's hidden fields (`__VIEWSTATE` and the other inputs
  of `aspnetForm`).
- **Which rows:** rows with a "see score" link (Pearson shows the link only once a score exists) and a due date the
  dashboard still shows (within the last 7 days, or later). Soonest-due first.
- **How:** the connector asks for each row's score the same way the page does: a POST to
  `DoAssignments.aspx?view=all` with the form's fields plus `__CALLBACKID=__Page` and `__CALLBACKPARAM=<cell id>`.
- The score is shown only on finished work, the same as every other source.
- **Answer handling:**
  - ASP.NET may put an event-validation block before the answer; that block is skipped.
  - A leading `s` means success; the text after it is split on `_`, and part 6 is the score.
  - An `e` answer, or anything that does not have 6 parts, gives no score.
- A cell that already holds a score (`<span>92%</span>`) is read directly, with no request.
- **Limits:**
  - At most 10 score requests per sync, two at a time, with a 10-second timeout each.
  - A failed request gives no score and never fails the Pearson sync.
- This is the read-only request the "see score" link sends. It does not open, start or submit anything.

### 3.4 Platform pages (visit window, on Refresh)

- **Which items:**
  - finished (Done or Submitted);
  - shown on the dashboard (due within the last 7 days, or later);
  - a Brightspace homework launch link exists;
  - the platform's reader is `page` or `universal` (not Gradescope or Pearson, which have their own sources);
  - no score from 3.1 or 3.2 in this sync;
  - not a quiz or exam (the existing `NEVER_OPEN` rule).
- **When:** every manual Refresh, after due-date visits, inside the same run and window. These visits share the
  25-page and 5-minute limits; due-date visits are scheduled first.
- **How:** a new visit mode `score`. It reuses the full-page launch, landing wait, reader rounds and "open the
  assignment" button. The reader looks for a score instead of a due date and answers
  `{ type: 'visitScore', score, frameUrl }`. It reports `null` at its time limit, like `visitFound`.
- **Stored** in `captured[itemKey]` as `score?: Score` and `scoreCheckedAt`, next to the due-date fields. A visit that
  finds nothing keeps the previous score, because a page that failed to load must not erase a good one.

## 4. Reading a score from page text

New pure module `src/core/scoreText.ts`, `findScore(lines: string[]): { score, evidence } | null`. A match needs a
label:

| Accepted | Example | Read as |
|---|---|---|
| a / b followed by points or pts | "1.5 / 25 points", "18/20 pts" | 1.5/25 |
| Score, Grade or Points label, then a / b | "Score: 18 / 20", "Grade 9.5/10" | 18/20 |
| Score or Grade label, then a percentage | "Score: 92%", "Grade 87.5 %" | 92% |
| a / b, then "points earned" | "18 of 20 points earned" | 18/20 |

Rejected:

- No label: "3/10", "Question 3 / 10", "Page 2/5", "10 questions".
- Dates: "11/10/2026", "11/10".
- Penalty or policy percentages: "70% score reduction", "50% score reduction after third attempt". A percentage
  followed by "reduction", "penalty", "late" or "off" is not a score.
- earned > possible × 1.5, or possible = 0.
- More than one different labeled score in the same frame: no score.

WileyPLUS's assignment header "1.5 / 25 points" matches the first row. Tests are built from the saved WileyPLUS,
Achieve and Pearson exports, plus synthetic cases for each rejected form.

## 5. Data flow

- `RawItem.score?: Score`: Brightspace (from 3.1, joined in the connector), Gradescope (3.2) and Pearson (3.3). It is stored in the
  snapshot like the rest of the item.
- `CapturedDue.score?` and `scoreCheckedAt?`: platform pages (3.4).
- `buildDashboard`: `Item.score` is taken from the merged raw items (Brightspace first, then Gradescope, then Pearson), else from
  `captured[ownKey].score`. It is set only when the item is finished: `doneByUser || submitted`.
- `dueVisits` returns due targets first, then score targets (section 3.4). The `VisitTarget.mode` union gains
  `'score'`.
- `applyOutcomes`: a `score` outcome updates `captured[key].score` and `scoreCheckedAt`. Score visits never change
  `misses`, `failures` or due-date fields.

## 6. Interface

- `DueBadge` takes an optional `score`. The label becomes "Done · 18/25" or "Submitted · 92%", and the `title`
  attribute reads "Score from WileyPLUS". The same tone as today is used, with no color by value.
- Every place that uses `ItemRow` shows it: course cards, course detail, "Done this week", To-do and Calendar
  details.
- Diagnostics visit log: score visits are logged with `result: 'score'`, the score text and the evidence line.

## 7. Privacy and store listings

- Privacy policy: add "DueBoard also reads the scores of your finished work from Brightspace's gradebook, Gradescope,
  Pearson MyLab and the assignment pages it already opens. Scores stay in your browser."
- Chrome listing: single purpose becomes "...assignments, deadlines, scores and course resource links...". The
  Brightspace host permission justification adds "grades".
- Firefox listing: one line under "What you get".
- No new permissions: the gradebook is on purdue.brightspace.com, and platform pages already have access.

## 8. Testing

- Unit:
  - `findScore`: every accepted and rejected form in section 4, plus the saved WileyPLUS export.
  - Gradebook mapping: id match, unique name match, ambiguous name skipped, ungraded value ignored, 403 course
    tolerated.
  - Gradescope parse keeps "18.0 / 20.0" as "18/20".
  - Pearson:
    - reads a shown `<span>100%</span>`;
    - builds the callback body from the form's fields;
    - parses `s…H_729259668_IVF_2_False_100%` and an answer with a validation prefix;
    - gives no score for `e…` or malformed answers;
    - sends at most 10 requests;
    - built from the student's export.
  - `buildDashboard`: no score on unfinished work, and source precedence.
  - `dueVisits`: score targets come after due targets, are only finished work, and are left out when a fetched
    score exists.
  - `applyOutcomes`: a null score keeps the previous one.
  - `DueBadge` label and title.
- End-to-end (`npm run e2e:visits`):
  - A mock WileyPLUS assignment shows "18 / 25 points". The item is marked done, Refresh runs, and the card shows
    "Done · 18/25".
  - A mock gradebook grade appears on a Brightspace assignment.
  - A page with "Question 3/10" only produces no score.
- Release: version 1.3.0, CHANGELOG, Firefox lint 0 errors.

## 9. Risks

- **Name mismatch between gradebook and content:** handled by unique-name matching only. Unmatched items fall back to
  platform pages.
- **A platform shows the class average or a practice score near the student's score:** the label rules and "more than
  one labeled score → none" keep it from being shown. The visit log records the evidence so a wrong read can be found
  and fixed.
- **More windows on Refresh:** score visits ride in the same window and run as the due-date visits, within the same
  limits.
