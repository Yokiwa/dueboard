# Done or not, scores, and every overdue item of the term (1.5.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> For this plan the user chose inline execution (superpowers:executing-plans), no subagents.

**Goal:** DueBoard knows whether each piece of work of the term is done, shows its score, and lists every past-due item that is not done, marking the ones it could not check "Not sure".

**Architecture:** Connectors attach what they know to raw items (`score`, `submissionKnown`); after each sync those answers are folded into a persistent `completion` store, as are the answers of a new `check` visit mode that runs through the 1.4 visit pass (hidden frame first, window fallback). The dashboard combines the store, the raw items and the student's own choices into each item's state; the UI shows scores, a "Not sure" tag and a collapsed Overdue group.

**Tech Stack:** WXT 0.21 MV3, TypeScript, React 19, Tailwind 4, Vitest + happy-dom, Playwright e2e (`scripts/e2e-frames.cjs`, `scripts/e2e-visits.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-12-completion-design.md`

## Global Constraints

- Everything in the repo is in English (code, comments, docs, copy).
- No new browser permissions; Brightspace is the only sign-in; DueBoard never asks for or handles passwords.
- Visits are read-only: the only buttons pressed are the existing "open the assignment" rule and Pearson's "Assignments" sign-in step; never Start, Continue, Retry, Submit.
- A wrong "done" is worse than "Not sure": a state is recorded only when the source says it clearly.
- Term window for `assignment`, `quiz` and `manual` items: from `courseTerm(course, now).start`; `exam` and `event` keep the 7-day rule.
- Limits per sync: 40 extra Brightspace `mySubmissions` requests (past-due folders not known done, most recently due first); 15 `check` visits (after due-date visits); Pearson score callbacks stay at 10, two at a time, 10 s each.
- Re-check rules: unknown past-due platform pages at most once a day, and after 3 page checks in a row with no answer only on Refresh; done items due in the last 14 days re-read daily; older done items never.
- Copy (exact): "Not sure"; hint "DueBoard couldn't tell whether you've done this — tick it if you have."; "Show all {n} overdue"; "Show fewer"; badge hints "Score from {from}" and "{source} shows it as submitted".
- Commits end with the session's attribution lines; no model names in commits.
- Version 1.5.0.

## Review Focus

- A course with no Brightspace start date: the semester guess decides the term window; work dated before it is not shown as overdue (Task 5 test `course without start date uses the semester guess`).
- The same work from two sources (a Brightspace topic merged with a Gradescope item) where one says not done and the other done: the item is done (Task 2 test `done from any source wins over not_done from another`, Task 5 test `merged items combine their sources`).
- A source that fails (dropbox 403, gradebook 404, Pearson callback timeout, a sync cut short): no record changes, never a false "not done" (Task 3 test `a failed mySubmissions request records nothing`, Task 4 test `a failed score callback records nothing`).
- The student un-ticks automatic done work and a later sync reads its score again: it stays not done (Task 2 test `notDone outlasts later answers`).
- An instructor moves a due date after the item was overdue: overdue and "Not sure" follow the current date (Task 5 test `a deadline moved into the future leaves Overdue`).

---

## File Structure

- `src/core/types.ts` — `Score` (from 1.3.0), `CheckAnswer`, `CompletionRecord`, `RawItem.score/submissionKnown`, `Item.score/doneBy/notSure`, `UserState.notDone`, `StoreShape.completion`.
- `src/core/scoreText.ts` — ported from `feat/scores` unchanged (`findScore`, `formatPoints`).
- `src/core/completion.ts` (new) — pure rules: answers from raw items, folding answers into records, an item's combined state.
- `src/background/completion.ts` (new) — after a sync, fold the snapshots' answers into the store.
- `src/connectors/brightspace/{api,map,index}.ts` — gradebook (ported), `GradeItemId`, term-wide submission asks.
- `src/connectors/gradescope/parse.ts`, `src/connectors/pearson/{parse,index}.ts` — scores (ported), statuses, completion-aware selection.
- `src/core/dashboard.ts`, `src/core/courseWeek.ts` — term window, item state.
- `src/visits/finders/completion.ts` (new) — `findCompletion` on a page.
- `src/visits/{schedule,apply,runner,frameRunner,messages}.ts`, `src/visits/finders/run.ts`, `src/visits/frame/{host,protocol}.ts`, `src/background/visitPass.ts` — the `check` mode.
- `src/ui/views/TodoView.tsx`, `src/ui/components/{DueBadge,ItemRow}.tsx`, `src/ui/views/CourseDetail.tsx`, `src/ui/views/CalendarView.tsx`, `src/ui/i18n.tsx`, `src/storage/store.ts` — interface and store.

---

### Task 1: Scores from page text (port)

**Files:**
- Create: `src/core/scoreText.ts`, `tests/core/scoreText.test.ts` (both from `feat/scores`)
- Modify: `src/core/types.ts` (add `Score`, `RawItem.score?: Score`)

**Interfaces:**
- Produces: `interface Score { text: string; earned?: number; possible?: number; from: string; evidence?: string }`; `findScore(lines: string[], from: string, now?: Date): Score | null`; `formatPoints(earned: number, possible: number): string`.

- [ ] **Step 1:** `git checkout feat/scores -- src/core/scoreText.ts tests/core/scoreText.test.ts`; add `Score` and `RawItem.score?: Score` to `src/core/types.ts` exactly as on `feat/scores`.
- [ ] **Step 2:** Run `npx vitest run tests/core/scoreText.test.ts && npx tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 3:** Commit `feat: read scores from page text (from 1.3.0)`.

### Task 2: Completion rules

**Files:**
- Create: `src/core/completion.ts`, `tests/core/completion.test.ts`
- Modify: `src/core/types.ts`, `src/storage/store.ts` (`KEYS`, `migrate`: `completion` object, `userState.notDone` object)

**Interfaces:**
- Consumes: `Score`.
- Produces:
  - `type CheckAnswer = { state: 'done'; by: 'submitted' | 'score'; source: string; score?: Score; evidence?: string } | { state: 'not_done'; source: string; evidence?: string }`
  - `interface CompletionRecord { state: 'done' | 'not_done' | 'unknown'; by?: 'submitted' | 'score'; source?: string; score?: Score; evidence?: string; checkedAt: string; tries?: number }`
  - `RawItem.submissionKnown?: boolean` (the source answered "submitted or not"); `UserState.notDone: Record<string, true>`; `StoreShape.completion: Record<string, CompletionRecord>`
  - `answerOf(raw: RawItem, source: string): CheckAnswer | null`
  - `foldAnswer(prev: CompletionRecord | undefined, answer: CheckAnswer | null, now: Date, opts?: { page?: boolean }): CompletionRecord | undefined`
  - `itemState(keys: string[], completion: Record<string, CompletionRecord>, userState: UserState): { done: boolean; doneBy?: { by: 'submitted' | 'score' | 'user'; source?: string; evidence?: string }; score?: Score; known: 'done' | 'not_done' | 'unknown' }`

- [ ] **Step 1: Write the failing tests** in `tests/core/completion.test.ts`:
  - `answerOf: a score means done by score` — raw with `score {text:'18/25'}` → `{ state:'done', by:'score', source:'Gradescope', score }`.
  - `answerOf: submitted and known means done by submitted; known and not submitted means not_done; unknown means null`.
  - `foldAnswer: done keeps an earlier score when the new answer has none` — prev done with score `18/25`, answer done/submitted → record keeps score, `checkedAt` = now.
  - `foldAnswer: a page check with no answer adds a try and keeps the state` — prev unknown tries 1, answer null, `{page:true}` → tries 2; without `page` → returns prev unchanged.
  - `foldAnswer: a later not_done replaces unknown; a later done replaces not_done` (the "Not sure resolves itself" rule).
  - `itemState: done from any source wins over not_done from another` — keys `['brightspace:topic:1','gradescope:9']`, records not_done and done → `done: true, known: 'done'`.
  - `itemState: the student's tick wins` — `userState.done[key]` → `done: true, doneBy.by: 'user'`.
  - `notDone outlasts later answers` — `userState.notDone[key]` with a done record → `done: false, known: 'not_done'` (no "Not sure").
- [ ] **Step 2:** `npx vitest run tests/core/completion.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the types, `migrate` defaults (`completion: {}`, `userState.notDone: {}`) and `src/core/completion.ts`. Precedence in `itemState`: notDone → user done → any done record (the first with a score supplies `score`) → any not_done → unknown.
- [ ] **Step 4:** `npx vitest run tests/core/completion.test.ts tests/storage` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: completion records and their rules`.

### Task 3: Brightspace — gradebook scores and term-wide submissions

**Files:**
- Modify: `src/connectors/brightspace/api.ts` (`GradeValue`, `DropboxFolder.GradeItemId`, `Quiz.GradeItemId?: number | null`, `urls().grades`), `src/connectors/brightspace/map.ts` (`attachGrades`, `gradeScore` from `feat/scores`; `toDropboxItem` gains `submissionKnown`), `src/connectors/brightspace/index.ts`
- Test: `tests/connectors/brightspace.test.ts`, `tests/connectors/brightspaceMap.test.ts` (existing files; add cases)

**Interfaces:**
- Consumes: `CompletionRecord`.
- Produces: `createBrightspaceConnector(opts: BrightspaceOptions & { completion?: () => Promise<Record<string, CompletionRecord>> })`; `toDropboxItem(f, ou, base, submitted: boolean | null)` (`null` = not asked → `submissionKnown` absent).

- [ ] **Step 1: Write the failing tests:**
  - `asks mySubmissions for past-due folders not known done, most recently due first, at most 40 beyond the usual window` — 3 courses with 50 past-due folders in total, 5 of them `done` in `completion`: exactly 40 extra asks, none for the 5, the 40 latest-due ones.
  - `a folder asked and answered with no submission is submissionKnown and not submitted`.
  - `a failed mySubmissions request records nothing` — the item has no `submissionKnown`.
  - `gradebook: a quiz gets its score by GradeItemId; a topic gets one by its unique name` (ports of the 1.3.0 `attachGrades` tests, plus the quiz id case).
  - `a 404 gradebook leaves the course readable and not partial`.
- [ ] **Step 2:** Run `npx vitest run tests/connectors/brightspace*` — Expected: FAIL.
- [ ] **Step 3:** Implement: fetch folders/quizzes/toc/grades per course in parallel as now; then build one ask list across courses — the existing window (−7 d … +30 d) plus past-due folders whose `completion[brightspace:dropbox:<id>]?.state !== 'done'`, sorted by due date descending, the extra ones capped at 40 — then ask (in parallel, as now); then map items. Quiz `GradeItemId` goes into `gradeIdOf` like folders.
- [ ] **Step 4:** Run the same tests — Expected: PASS.
- [ ] **Step 5:** Commit `feat(brightspace): gradebook scores and submissions for the whole term`.

### Task 4: Gradescope and Pearson; folding answers after a sync

**Files:**
- Modify: `src/connectors/gradescope/parse.ts`, `src/connectors/pearson/parse.ts`, `src/connectors/pearson/index.ts` (score callback from `feat/scores`), `src/entrypoints/background.ts`
- Create: `src/background/completion.ts`
- Test: `tests/connectors/gradescope.test.ts`, `tests/connectors/pearson*.test.ts`, `tests/background/completion.test.ts`

**Interfaces:**
- Consumes: `answerOf`, `foldAnswer`, `CompletionRecord`.
- Produces: `createPearsonConnector({ parse, fetchImpl?, completion?, now? })`; `foldSnapshots(completion: Record<string, CompletionRecord>, snapshots: StoreShape['snapshots'], now: Date): Record<string, CompletionRecord>`; `recordCompletion(load, save, now): Promise<void>` in `src/background/completion.ts`.

- [ ] **Step 1: Write the failing tests:**
  - Gradescope: `a scored row is submitted with its score`; `"No Submission" is submissionKnown and not submitted`; `"Submitted" without a score is submitted`.
  - Pearson: `asks scores for past-due rows not known done and for done rows due in the last 14 days not checked today, most recently due first, at most 10` ; `a cell that already shows a score needs no request`; `a failed score callback records nothing` (ports of the 1.3.0 callback tests otherwise).
  - `foldSnapshots: every raw item with an answer gets a record under "<source>:<sourceItemId>"; items without one are left alone`.
- [ ] **Step 2:** Run the three test files — Expected: FAIL.
- [ ] **Step 3:** Implement. Pearson keys are `pearson:<assignmentId>`. In `background.ts` the connectors get `completion: () => loadStore().then((s) => s.completion)`, and the `sync` dependency runs `recordCompletion` after `syncWithDiscovery`.
- [ ] **Step 4:** Run the tests — Expected: PASS.
- [ ] **Step 5:** Commit `feat: Gradescope and Pearson completion; answers kept across syncs`.

### Task 5: The dashboard's term window and item state

**Files:**
- Modify: `src/core/types.ts` (`Item.score?: Score`, `Item.doneBy?`, `Item.notSure?: boolean`), `src/core/dashboard.ts` (`DashboardInput.completion`, `inWindow`), `src/core/courseWeek.ts` (`detailGroups.overdue` most recently due first), callers passing `completion`
- Test: `tests/core/dashboard.test.ts` (or the existing dashboard test file), `tests/core/courseWeek.test.ts`

**Interfaces:**
- Consumes: `itemState`, `courseTerm`.
- Produces: `Item.submitted` true for automatic done; `Item.doneByUser` unchanged meaning; `Item.notSure` true exactly when past due, not done, `known === 'unknown'`, type `assignment` or `quiz`.

- [ ] **Step 1: Write the failing tests:**
  - `an assignment due 5 weeks ago in a current course is shown; an event 5 weeks ago is not`.
  - `course without start date uses the semester guess` — a course with `start: null`, items dated in July (before the August 1 guess) are not shown in November.
  - `a done record makes the item submitted with its score and doneBy`.
  - `a past-due unknown assignment is notSure; a manual entry is not; a not_done one is not`.
  - `merged items combine their sources` — Brightspace topic + Gradescope item with one done record → done.
  - `a deadline moved into the future leaves Overdue` — item with a not_done record and a future date → not overdue, not notSure.
  - `detailGroups lists overdue most recently due first`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement: `inWindow` per type (term start for `assignment`/`quiz`/`manual`, 7 days for `exam`/`event`); after merging and date filling, apply `itemState(m.sourceKeys, input.completion ?? {}, input.userState)`.
- [ ] **Step 4:** Run `npx vitest run` — Expected: PASS (fix existing tests whose fixtures relied on the 7-day rule for assignments only where the new rule is the intended behavior).
- [ ] **Step 5:** Commit `feat: every overdue item of the term, with its state`.

### Task 6: Interface

**Files:**
- Modify: `src/ui/views/TodoView.tsx`, `src/ui/components/DueBadge.tsx`, `src/ui/components/ItemRow.tsx` (badge with score from `feat/scores`), `src/ui/views/CourseDetail.tsx`, `src/ui/views/CalendarView.tsx`, `src/ui/i18n.tsx`, `src/storage/store.ts` (`setDone(keys, done, auto)`)
- Test: `tests/ui/todo.test.tsx`, `tests/ui/markDone.test.tsx`, `tests/ui/calendar.test.tsx`, `tests/ui/courses.test.tsx`

**Interfaces:**
- Consumes: `Item.score`, `Item.doneBy`, `Item.notSure`, `UserState.notDone`.
- Produces: i18n keys `todo.showAllOverdue` ("Show all {n} overdue"), `todo.showFewer` ("Show fewer"), `item.notSure` ("Not sure"), `item.notSureHint`, `badge.scoreFrom` ("Score from {from}"), `badge.submittedOn` ("{source} shows it as submitted").

- [ ] **Step 1: Write the failing tests:**
  - `Overdue shows the 3 most recently due and "Show all 5 overdue"; clicking shows all and "Show fewer"`.
  - `a notSure item shows "Not sure" with the hint`.
  - `a done item with a score shows "Done · 18/25" and "Score from Gradescope"`.
  - `un-ticking automatic done work records notDone for its keys; ticking it again clears notDone`.
  - `the calendar shows a done item 5 weeks ago muted and an overdue one urgent`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run tests/ui` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(ui): scores, "Not sure" and a shorter Overdue group`.

### Task 7: Reading completion on a page

**Files:**
- Create: `src/visits/finders/completion.ts`, `tests/visits/completion.test.ts`
- Modify: `src/visits/messages.ts` (`visitCheck`), `src/visits/finders/run.ts`, `src/visits/frame/protocol.ts` (`FrameConfig.mode` and `FrameResult` gain `check?: CheckAnswer | null`, status `'checked'`), `src/visits/frame/host.ts`
- Test: `tests/visits/finderScript.test.ts`, `tests/visits/frameHost.test.ts`

**Interfaces:**
- Consumes: `findScore`, `CheckAnswer`.
- Produces: `findCompletion(doc: Document, from: string, now?: Date): CheckAnswer | null`; message `{ type: 'visitCheck'; check: CheckAnswer | null; frameUrl: string; top: boolean }`; `visitFound` gains `check?: CheckAnswer`; frame mode `'check'` ends `checked` on the first non-null `visitCheck` or at the read time, with `none`-like fallback rules.

- [ ] **Step 1: Write the failing tests:**
  - `findCompletion: "Score: 18/25" is done by score`; `a short "Submitted" badge is done by submitted`; `"Not submitted" as its own element is not_done`; `"will be graded" in a sentence, a bare "18/25", and a list of assignments give null`.
  - Finder: `in check mode a page with "Score: 18/25" sends visitCheck at once`; `a page with nothing sends visitCheck null at the time limit with a sample`; `a due-mode visitFound carries the check when the page shows one`.
  - Host: `check mode ends checked with the answer`; `check mode with no answer ends none-like after the read time`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement. Status words count only in an element whose own text is at most 4 words (`Submitted`, `Completed`, `Turned in`, `Graded`; `Not submitted`, `Not started`, `No submission`, `Not attempted`); a score from `findScore(pageLines(doc), from)` wins.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(visits): read whether a page shows the work done`.

### Task 8: The check mode in the visit pass

**Files:**
- Modify: `src/visits/schedule.ts` (`VisitTarget.mode` adds `'check'`, `VisitOutcome` adds `{ status: 'checked'; check: CheckAnswer | null; host }` and `found.check?`, `checkTargets`), `src/visits/frameRunner.ts`, `src/visits/runner.ts`, `src/visits/apply.ts` (completion patch), `src/background/visitPass.ts` (saves `completion`; window learning counts `checked` with an answer), `src/background/syncFlow.ts`
- Test: `tests/visits/schedule.test.ts`, `tests/visits/frameRunner.test.ts`, `tests/visits/runner.test.ts`, `tests/visits/apply.test.ts`, `tests/background/visitPass.test.ts`

**Interfaces:**
- Consumes: `CompletionRecord`, `foldAnswer`, Task 7 messages.
- Produces: `dueVisits` returns due targets, then at most 15 `check` targets; `applyOutcomes(...)` returns `completion` too.

- [ ] **Step 1: Write the failing tests:**
  - Schedule: `check targets: past-due platform homework not known, or done and due in the last 14 days not checked today`; `not: quizzes, Gradescope/Pearson, items without a launch link, notDone or ticked items`; `after 3 tries only on Refresh`; `at most 15, after due-date targets`.
  - Apply: `a checked answer folds into completion; a null answer adds a try`; `a found outcome with a check also records it`.
  - Frame runner / window runner: `checked outcomes map and log their answer and evidence`.
  - Visit pass: `a platform the window checked and the frame could not is learned like a found date`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(visits): check completion on platform pages`.

### Task 9: End-to-end

**Files:**
- Modify: `scripts/e2e/mock-sites.cjs`, `scripts/e2e-frames.cjs`

- [ ] **Step 1:** Add mock data: two past-due folders (one with a submission, one without), a quiz with a gradebook score, a Gradescope row "No Submission", a Pearson row with a score, a WileyPLUS-like page showing "Score: 18/25" and one showing nothing.
- [ ] **Step 2:** Add checks: the submitted folder is done and not in Overdue; the other is Overdue without "Not sure"; the quiz shows its score; the scored page item is done with "18/25"; the empty page item is "Not sure"; un-ticking an automatic done item and syncing again keeps it not done; Overdue shows 3 and "Show all N overdue".
- [ ] **Step 3:** `npm run e2e:frames && npm run e2e:visits` — Expected: "all checks passed" twice.
- [ ] **Step 4:** Commit `test(e2e): completion, scores and Overdue`.

### Task 10: Docs, version, builds

**Files:**
- Modify: `docs/privacy.html`, `store/listing.md`, `store/firefox-listing.md`, `CHANGELOG.md`, `package.json` (1.5.0), `docs/guide/06-trial-1.4.md` (zip names)

- [ ] **Step 1:** Privacy and listings: DueBoard reads the student's own gradebook scores and completion states, on their computer only; check visits are read-only.
- [ ] **Step 2:** `npx vitest run && npx tsc --noEmit && npm run lint:firefox && npm run zip && npm run zip:firefox` — Expected: all green, `dueboard-1.5.0-*.zip`.
- [ ] **Step 3:** Commit `1.5.0: done or not, scores, every overdue item of the term`.

### Task 11: Full review

- [ ] **Step 1:** Read every changed file again (`git diff main...HEAD`) against the spec, section by section, and list each requirement with the line that implements it.
- [ ] **Step 2:** Check the edge cases on purpose, each with a test if missing: no course start date; no due date; the same work on two platforms; a sync cut short (visit pass stopped, connector throws); every source failing; dates on the 14-day and 7-day boundaries; a deadline moved; a student override then a new answer; a store from 1.4.9 (no `completion`, no `notDone`).
- [ ] **Step 3:** Fix what is found (test first), run everything again (`npx vitest run`, `npx tsc --noEmit`, both e2e suites, `lint:firefox`).
- [ ] **Step 4:** Commit the fixes; give the user the list of what was found and fixed.
