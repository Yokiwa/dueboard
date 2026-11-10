# Background Reading (1.4.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read platform due dates inside a hidden page of the extension (no window), with every known platform allowed at install, automatic syncing by default, a sign-in flow that ends on the dashboard, 12 more platforms, and faster runs.

**Architecture:**
- A *frame host* (Chrome: the offscreen document; Firefox: the background page) loads each homework launch link in an iframe.
- A declared content script, the *frame reader*, runs the existing finder inside those iframes and talks only to the frame host.
- A `declarativeNetRequest` session rule removes embedding headers for requests outside any tab while a run is in progress.
- A *visit pass* runs frame visits (3 at once), saves each result as it arrives, then sends pages the background could not read to the existing window runner.

**Tech Stack:** WXT 0.21 (MV3), TypeScript, React 19, Vitest + happy-dom, Playwright (preinstalled Chromium), web-ext lint.

**Spec:** `docs/superpowers/specs/2026-11-10-background-reading-design.md`

## Global Constraints

- Work on branch `feat/background-reading` from `main`. Do not touch `feat/scores`.
- The repository, UI, docs and commit messages are English only.
- DueBoard never types, starts or submits anything. The only button ever pressed is a platform's "open the assignment" (`src/visits/finders/open.ts`).
- Titles matching `NEVER_OPEN` (quiz, exam, midterm, test) and platforms flagged `neverOpen` are never opened, in a frame or a window.
- The header rule applies only to `sub_frame` requests with `tabIds: [-1]`, and exists only while a visit pass runs. Requests in the student's tabs are never modified.
- The frame reader does nothing in a normal tab: no DOM change, no runtime message, no `postMessage` that a website can receive.
- Assignment data (titles, dates, page text) travels only over `runtime` messaging. `postMessage` carries only a random nonce.
- Window mode keeps its 1.2.4 behavior and limits: one window, one page at a time, 25 pages, 5 minutes.
- Frame mode limits: 3 visits at once, never 2 with the same frame key, 60 pages and 8 minutes per run, 20 s for the first hello, 22 s of reading after it.
- A page whose frame visit ends `blocked` or `none` is read in a minimized window in the same run, on automatic syncs too, unless `settings.windowFallback` is false.
- Recheck rules (`rank` in `src/visits/schedule.ts`) do not change.
- Version 1.4.0, CHANGELOG entry, Firefox lint at 0 errors.
- Every commit ends with:
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01YSmZu67Q1vHhbmVgwmotvG`.

## Review Focus

1. **The student browses a platform site in a normal tab** (the reader is declared on it): nothing is sent or changed. Test: Task 2.
2. **The background restarts in the middle of a run:** leftover iframes and the header rule are removed at the next start. Test: Task 3.
3. **A page in the frame never says hello, or navigates forever:** the visit ends `blocked` at 20 s and its iframe is removed; 60 visits leave 0 iframes. Test: Task 3.
4. **A page script sends a fake hello** (wrong shape, or a nonce no reader owns): nothing crashes and no data reaches the page. Test: Task 3.
5. **An existing student picked "Only when I click Refresh" after updating:** the one-time switch to automatic never runs again. Test: Task 8.

---

### Task 1: Platforms and install-time site access

**Files:**
- Modify: `src/core/platformRegistry.ts`, `src/core/permissions.ts`, `wxt.config.ts`, `src/visits/schedule.ts` (the `NEVER_OPEN` check), `src/ui/components/SiteAccessBanner.tsx`
- Test: `tests/core/platformRegistry.test.ts`, `tests/core/permissions.test.ts`, `tests/visits/schedule.test.ts`

**Interfaces:**
- Produces:
  - `PlatformDef.neverOpen?: boolean`.
  - `manifestOrigins(): string[]` in `platformRegistry.ts`: `https://purdue.brightspace.com/*` first, then one `https://<host>/*` per host of every platform with `reader !== 'none'`, deduplicated, sorted.
  - `REQUIRED_ORIGINS = manifestOrigins()` in `permissions.ts`.

- [ ] **Step 1: Write failing tests:**
  - New platforms, by `platformByHost` and by title:

    | id | label | category | hosts | title | reader | neverOpen |
    | --- | --- | --- | --- | --- | --- | --- |
    | `labflow` | LabFlow | homework | `*.labflow.com` | `/labflow/i` | universal | |
    | `beyondlabz` | BeyondLabz | homework | `*.beyondlabz.com` | `/beyond\s*labz/i` | universal | |
    | `circuit` | Circuit | homework | (none) | `/\bcircuit\b.*(peer|review)|peer review.*\bcircuit\b/i` | universal | |
    | `variate` | Variate | homework | (none) | `/\bvariate\b/i` | universal | |
    | `campuswire` | Campuswire | discussion | `*.campuswire.com` | `/campuswire/i` | none | |
    | `iclicker` | iClicker | other | `*.iclicker.com` | `/i-?clicker/i` | none | |
    | `googleforms` | Google Forms | other | `forms.gle`, `forms.google.com` | `/google forms?/i` | none | |
    | `turnitin` | Turnitin | other | `*.turnitin.com` | `/turnitin/i` | none | |
    | `examsoft` | ExamSoft | other | `*.examsoft.com` | `/examsoft|examplify/i` | none | yes |
    | `respondus` | Respondus | other | `*.respondus.com` | `/respondus|lockdown browser/i` | none | yes |
    | `honorlock` | Honorlock | other | `*.honorlock.com` | `/honorlock/i` | none | yes |
    | `examity` | Examity | other | `*.examity.com` | `/examity/i` | none | yes |

  - Existing entries cover their whole domain: `platformByHost('sso.wiley.com')?.id === 'wileyplus'`, `platformByHost('login.pearson.com')?.id === 'pearson'`, `platformByHost('iam.macmillanlearning.com')?.id === 'achieve'`.
  - `manifestOrigins()` contains `https://purdue.brightspace.com/*`, `https://*.wiley.com/*`, `https://*.labflow.com/*`; does not contain any Campuswire, Turnitin, Google or proctoring origin; has no duplicates.
  - `dueVisits` never returns a topic titled "Honorlock practice" or "ExamSoft setup", even with a launch URL.
  - `platformAsks` (the "Allow" banner list) is empty when `granted` is `manifestOrigins()` and the courses link only to registry platforms; a platform with no hosts (`circuit`) never produces an ask by itself.
- [ ] **Step 2: Run** `npx vitest run tests/core tests/visits/schedule.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - Add the 12 entries after the existing 24 (first match wins, so order matters only among new ones).
  - Widen `wileyplus` to `*.wiley.com` and `pearson` to `*.pearson.com` plus its existing hosts; check every other `reader !== 'none'` entry already uses a `*.domain` host.
  - `wxt.config.ts`: `host_permissions: manifestOrigins()` (import from `./src/core/platformRegistry`); add permission `declarativeNetRequestWithHostAccess`; keep `optional_host_permissions`.
  - `schedule.ts`: skip a candidate when `platform?.neverOpen`.
  - `SiteAccessBanner.tsx`: its label map is built from the registry (`Brightspace` for the Brightspace origin, the platform label otherwise).
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`, then `npm run build` and confirm `.output/chrome-mv3/manifest.json` lists the origins. Expected: all pass.
- [ ] **Step 5: Commit** `feat: 12 more platforms; site access for known platforms at install`.

### Task 2: Frame protocol and frame reader

**Files:**
- Create: `src/visits/frame/protocol.ts`, `src/visits/frame/reader.ts`, `src/entrypoints/frame-reader.content.ts`, `src/entrypoints/open-here.ts` (unlisted script)
- Modify: `wxt.config.ts` (`web_accessible_resources` for `open-here.js`, matches `manifestOrigins()`)
- Test: `tests/visits/frameReader.test.ts`

**Interfaces:**
- Consumes: `runFinder`, `FinderWindow` (`src/visits/finders/run.ts`); `VisitMessage` (`src/visits/messages.ts`); `manifestOrigins()`.
- Produces, in `protocol.ts`:

  ```ts
  export interface ListedTitle { key: string; title: string }
  export interface FrameVisitRequest {
    token: string; url: string; mode: 'due' | 'session' | 'syllabus';
    platform?: string; titles?: ListedTitle[]; helloMs?: number; readMs?: number;
  }
  export interface FrameConfig { mode: FrameVisitRequest['mode']; platform?: string; allowOpen: boolean; titles: ListedTitle[] }
  export interface Listed { key: string; found: FoundDue }
  export interface FrameResult {
    status: 'found' | 'none' | 'text' | 'landed' | 'blocked' | 'signed_out';
    host?: string; landed?: string; found?: FoundDue; lines?: string[];
    listed: Listed[]; frames: { url: string; top: boolean }[]; clicked: string[]; pages: PageSample[];
  }
  export type HelloPost = { dueboard: 'hello'; nonce: string };
  export type ReaderMessage =
    | { type: 'frameConfig'; nonce: string }                       // answered with FrameConfig | null
    | { type: 'frameMessage'; nonce: string; message: VisitMessage | { type: 'visitListed'; listed: Listed[] } };
  export const isHelloPost: (v: unknown) => v is HelloPost;
  export const isReaderMessage: (v: unknown) => v is ReaderMessage;
  ```
- Produces, in `reader.ts`: `startFrameReader(win: Window, deps: { extensionOrigin: string; send(m: ReaderMessage): Promise<unknown>; openHereUrl: string }): void`.

- [ ] **Step 1: Write failing tests** (happy-dom; a fake `top` object with a `postMessage` spy):
  - Top is the window itself (a normal tab): no `postMessage`, no `send`, the document is unchanged. (Review Focus 1)
  - In a frame: one `top.postMessage({ dueboard: 'hello', nonce }, extensionOrigin)`; the nonce is 32 hex characters; the target origin argument is exactly `extensionOrigin`.
  - After the hello, the reader asks `send({ type: 'frameConfig', nonce })` every 250 ms for at most 5 s. A `null` answer every time → it stops, and nothing else is sent.
  - With config `{ mode: 'due', allowOpen: true, titles: [] }` on `<h1>HW 7</h1><p>Due Date: 11/10/2026 11:59 PM</p>`: a `frameMessage` carrying a `visitFrame`, then one carrying `visitFound` with that date.
  - With `allowOpen: true`, a `<script src=openHereUrl>` is added to the document once; with `allowOpen: false`, none.
- [ ] **Step 2: Run** `npx vitest run tests/visits/frameReader.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `reader.ts`: return at once when `win.top === win`. Otherwise post the hello, poll for the config, set `__dueboardMode`, `__dueboardPlatform`, `__dueboardAllowOpen` on the window, and call `runFinder(win, (m) => send({ type: 'frameMessage', nonce, message: m }))`.
  - `frame-reader.content.ts`: `defineContentScript({ matches: manifestOrigins(), allFrames: true, runAt: 'document_idle', main })` calling `startFrameReader` with `browser.runtime.sendMessage`.
  - `open-here.ts`: the same page-side patch `browserApi.ts` injects today (`window.open` navigates this frame), guarded by `window.top !== window`.
- [ ] **Step 4: Run** the same command, `npx tsc --noEmit`, `npm run build`. Expected: PASS; `frame-reader.js` and `open-here.js` are in the build.
- [ ] **Step 5: Commit** `feat: frame reader content script and protocol`.

### Task 3: Frame host, header rule and frame API

**Files:**
- Create: `src/visits/frame/host.ts`, `src/visits/frame/headers.ts`, `src/visits/frame/api.ts`
- Modify: `src/entrypoints/offscreen/main.ts`, `src/sync/offscreenParser.ts` (add the `DOM_SCRAPING` reason and a justification that names reading due dates), `src/entrypoints/background.ts` (Firefox: host in place; both: reset at start; the router must ignore `frameConfig` and `frameMessage`)
- Test: `tests/visits/frameHost.test.ts`, `tests/visits/frameHeaders.test.ts`

**Interfaces:**
- Consumes: Task 2's protocol; `SIGN_IN` (`src/visits/runner.ts`); `stripUrl`.
- Produces:
  - `createFrameHost(doc: Document, timers?: { now(): number }): { visit(req: FrameVisitRequest): Promise<FrameResult>; onPost(e: { data: unknown; source: unknown }): void; onMessage(m: unknown): FrameConfig | null | undefined; reset(): void }`.
  - `headers.ts`: `FRAME_RULE_ID = 9001`; `enableFrameHeaders(): Promise<void>`; `disableFrameHeaders(): Promise<void>`.
  - `api.ts`: `interface FrameApi { begin(): Promise<void>; visit(req: FrameVisitRequest): Promise<FrameResult>; end(): Promise<void>; reset(): Promise<void> }` and `createFrameApi(): FrameApi`.

- [ ] **Step 1: Write failing tests** (`frameHost`, fake timers, fake child windows with `parent` links):
  - `visit` adds one iframe with `src = req.url`; the promise resolves once and the iframe is removed afterwards.
  - A hello posted by a window whose `parent` chain reaches that iframe's `contentWindow` binds its nonce to the visit. A hello from an unrelated window, a malformed hello, or a nonce never posted is ignored, and `onMessage({ type: 'frameConfig', nonce: 'unknown' })` returns `null`. (Review Focus 4)
  - `onMessage({ type: 'frameConfig', nonce })` for a bound nonce returns `{ mode, platform, allowOpen: mode === 'due', titles }`.
  - No hello for 20 s → `{ status: 'blocked', listed: [], frames: [], … }`. (Review Focus 3)
  - Only Brightspace hellos, then 22 s → `blocked`.
  - A direct-child `visitFrame` whose URL matches `SIGN_IN` → `signed_out`.
  - A `visitFound` with a date → `found` at once, with `host` and `landed` from the direct child's latest non-Brightspace `visitFrame`.
  - `visitFound` null only, then 22 s after the first non-Brightspace hello → `none`.
  - Mode `session`: first direct-child non-Brightspace `visitFrame` → `landed`. Mode `syllabus`: `visitText` → `text` with its lines.
  - `visitClick`, `visitSample` and `visitListed` are collected into `clicked`, `pages` and `listed`.
  - 60 visits one after another leave 0 iframes; `reset()` removes iframes and resolves pending visits as `blocked`. (Review Focus 2, 3)
- [ ] **Step 2: Write failing tests** (`frameHeaders`, fake `browser.declarativeNetRequest`): `enableFrameHeaders` calls `updateSessionRules` removing id 9001 and adding one rule with `condition: { tabIds: [-1], resourceTypes: ['sub_frame'] }` that removes `x-frame-options` and `content-security-policy` response headers; `disableFrameHeaders` removes id 9001 only.
- [ ] **Step 3: Run** `npx vitest run tests/visits/frameHost.test.ts tests/visits/frameHeaders.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Offscreen `main.ts`: create the host; `window.addEventListener('message', host.onPost)`; in the existing `runtime.onMessage` listener answer `{ target: 'offscreen', kind: 'frameVisit', req }` with `host.visit(req)`, `kind: 'frameReset'` with `host.reset()`, and reader messages through `host.onMessage`.
  - `api.ts`: Chrome sends those messages after `ensureOffscreenDocument()`; Firefox (`IS_FIREFOX`) uses a host created on the background page. `begin` = `enableFrameHeaders`, `end` = `disableFrameHeaders`.
  - `background.ts`: at start, `void frameApi.reset().then(() => frameApi.end())`. (Review Focus 2)
- [ ] **Step 5: Run** the same tests, `npx vitest run`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: frame host, embedding-header rule and frame API`.

### Task 4: End-to-end harness for hidden frames

**Files:**
- Create: `scripts/e2e/mock-sites.cjs`, `scripts/e2e-frames.cjs`
- Modify: `scripts/e2e-visits.cjs` (take its responses from `mock-sites.cjs`), `package.json` (`"e2e:frames": "npm run build && node scripts/e2e-frames.cjs"`)

**Why:** Playwright's request routing does not see requests made by iframes of the offscreen document (checked with a probe: 0 handler calls). Hidden frames need a real server.

**Interfaces:**
- Produces: `mock-sites.cjs` exports `createMocks()` returning `{ respond(req: { url, method, headers }): { status, headers, body }, state }`, and `startServer(mocks): Promise<{ port, close }>` (HTTPS, self-signed certificate generated with `openssl` into a temp directory).

- [ ] **Step 1: Move** every mock answer of `e2e-visits.cjs` into `createMocks().respond`, keeping its counters and flags in `state`. `e2e-visits.cjs` keeps using `ctx.route`, now answering from `respond`.
- [ ] **Step 2: Run** `npm run e2e:visits`. Expected: `e2e visits: all checks passed` (no behavior change).
- [ ] **Step 3: Write** `e2e-frames.cjs`: start the server; launch Chromium with the built extension and `--host-resolver-rules=MAP * 127.0.0.1:<port>` plus `--ignore-certificate-errors`; seed one mock platform page that answers with `X-Frame-Options: DENY`; through the service worker call the frame API (`begin`, `visit`, `end`). If Chromium rejects the port in the rule, listen on port 443 and use `MAP * 127.0.0.1`.
- [ ] **Step 4: Check and run** `npm run e2e:frames`. Expected output ends `e2e frames: all checks passed`, with these checks:
  - the page that refuses framing is read: `status: 'found'` with the mock's date;
  - without `begin()`, the same visit ends `blocked`;
  - windows and tabs are the same before and after.
- [ ] **Step 5: Commit** `test: shared mock sites and an end-to-end harness for hidden frames`.

### Task 5: Frame runner

**Files:**
- Create: `src/visits/frameRunner.ts`
- Modify: `src/visits/schedule.ts` (`VisitOutcome`: `failed` reason gains `'frame'`; `landed` gains `via?: 'frame'`; `MAX_VISITS = 60`; export `WINDOW_MAX = 25`), `src/visits/runner.ts` (`VisitLogEntry.mode: 'frame' | 'window'`, window entries say `'window'`)
- Test: `tests/visits/frameRunner.test.ts`

**Interfaces:**
- Consumes: `FrameApi`, `FrameResult` (Task 3); `VisitTarget`, `VisitOutcome`; `platformByHost`.
- Produces:

  ```ts
  export interface FrameVisitDone { target: VisitTarget; outcome: VisitOutcome; fallback: boolean; listed: VisitOutcome[]; log: VisitLogEntry }
  export interface FrameRunOptions {
    keyOf(t: VisitTarget): string; signedIn(): Promise<boolean>;
    onDone(d: FrameVisitDone): Promise<void> | void;
    concurrency?: number; maxPages?: number; budgetMs?: number; now?: () => number;
  }
  export function runFrameVisits(targets: VisitTarget[], api: FrameApi, opts: FrameRunOptions): Promise<FrameVisitDone[]>;
  ```

- [ ] **Step 1: Write failing tests** (fake `FrameApi` with controllable promises):
  - `api.begin()` before the first visit and `api.end()` after the last, also when a visit throws.
  - At most 3 visits in flight; two targets with the same `keyOf` never overlap; order otherwise follows the input.
  - Result mapping:

    | Frame result | Outcome | `fallback` |
    | --- | --- | --- |
    | `found` | `{ status: 'found', found, host }` | false |
    | `none` | `{ status: 'none', host }` | true |
    | `text` | `{ status: 'text', lines, host }` | false |
    | `landed` | `{ status: 'landed', host, via: 'frame' }` | false |
    | `blocked`, `signedIn()` true | `{ status: 'failed', reason: 'frame' }` | true |
    | `blocked`, `signedIn()` false | `{ status: 'signed_out' }`, no new visit starts | false |
    | `signed_out` | `{ status: 'signed_out' }`, no new visit starts | false |

  - `listed` entries become `found` outcomes for keys still waiting; those targets are not visited. A listed entry for the visit's own key turns its `none` into `found` with `fallback: false`. Entries for keys already started are ignored.
  - Stops starting visits after `maxPages` (default 60) or `budgetMs` (default 480 000).
  - `onDone` is called once per finished target, in completion order; the log entry has `mode: 'frame'`, the landing page, frames, clicks, pages, and the date when found.
- [ ] **Step 2: Run** `npx vitest run tests/visits/frameRunner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `runFrameVisits`.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`. Expected: PASS (fix tests that pinned `MAX_VISITS` at 25 to use `WINDOW_MAX` where they mean the window limit).
- [ ] **Step 5: Commit** `feat: frame runner with per-platform concurrency`.

### Task 6: Visit pass: save as you go, window fallback, platform memory

**Files:**
- Create: `src/background/visitPass.ts`
- Modify: `src/background/syncFlow.ts` (the pass applies outcomes; `fullSync` no longer does), `src/entrypoints/background.ts` (wire the pass), `src/core/types.ts` (`Settings.windowFallback: boolean`, default `true`; `VisitState.frame: Record<string, { blocked: number; skipUntil?: string }>`; `sessions[src].frame?: 'failed'`), `src/storage/store.ts` (migrate both), `src/visits/apply.ts`
- Test: `tests/background/visitPass.test.ts`, `tests/background/syncAndVisit.test.ts`, `tests/storage/store.test.ts`

**Interfaces:**
- Consumes: `runFrameVisits` (Task 5); `runVisits` (window); `applyOutcomes`; `WINDOW_MAX`.
- Produces:

  ```ts
  export function frameKey(t: VisitTarget, captured: StoreShape['captured']): string;
  // t.platform ?? captured[t.key]?.platform ?? `course:${t.courseId}`
  export interface VisitPassDeps {
    load(): Promise<StoreShape>; save(patch: Partial<StoreShape>): Promise<void>; now(): Date;
    frames(targets: VisitTarget[], opts: FrameRunOptions): Promise<FrameVisitDone[]>;
    windows(targets: VisitTarget[], onLog: (e: VisitLogEntry) => void): Promise<VisitOutcome[]>;
    signedIn(): Promise<boolean>; progress(done: number, total: number): void; log(e: VisitLogEntry): void;
  }
  export function runVisitPass(deps: VisitPassDeps, targets: VisitTarget[]): Promise<VisitOutcome[]>;
  ```

- [ ] **Step 1: Write failing tests:**
  - A frame `found` is saved (through `applyOutcomes`) before the next visit finishes; a pass cut short keeps earlier results.
  - `fallback: true` results are not applied when a window visit will follow; the window outcome is the one applied (one `misses` or `failures` step per item per run, never two).
  - With `settings.windowFallback` false: no window targets at all; the frame outcomes are applied (`none` → a miss, `failed`/`frame` → a failure).
  - Window targets are: fallback items, plus items whose `frameKey` has `skipUntil` in the future, plus session targets with `sessions[src].frame === 'failed'`; cut to `WINDOW_MAX`; `deps.windows` is not called when there are none.
  - Runs on trigger `auto` exactly as on `manual` (the pass does not look at the trigger).
  - Memory: 3 `blocked` results in a row for one key set `skipUntil` to now + 7 days and reset the count; any hello-bearing result (`found`, `none`, `text`, `landed`) resets the count.
  - A `signed_out` from the frame pass ends the pass: no window visits.
  - `progress(done, total)`: `total` is the number of targets; `done` grows by one when an item is finally resolved.
  - `syncAndVisit`: after a frame-landed session target, a resync that is still `not_logged_in` sets `sessions[src].frame = 'failed'`; `fullSync` applies no outcomes itself.
  - `migrate`: `windowFallback` defaults to `true`; `visitState.frame` defaults to `{}`.
- [ ] **Step 2: Run** `npx vitest run tests/background tests/storage`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** In `background.ts` the pass's `frames` is `runFrameVisits(targets, frameApi, opts)` and `windows` is today's `runVisits(targets, visitApi, …)`; log entries are appended one by one as today.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, `npm run e2e:visits`. Expected: unit tests pass; the window e2e still passes (update its expectations only where a page is now read in a frame instead; note each change in the report).
- [ ] **Step 5: Commit** `feat: visit pass with background reading first and window fallback`.

### Task 7: Every date a page shows

**Files:**
- Create: `src/visits/finders/listed.ts`
- Modify: `src/visits/finders/run.ts` (send `visitListed` just before the frame's final message when titles were given), `src/visits/messages.ts`, `src/visits/schedule.ts` (`VisitTarget.titles?: ListedTitle[]`: for a `due` target, every `due` target of the same course in this run, itself included, at most 40)
- Test: `tests/visits/listed.test.ts`, `tests/visits/schedule.test.ts`

**Interfaces:**
- Consumes: `pageLines`, `compactBlocks` (`finders/lines.ts`); `findDueMatches` (`src/core/dueText.ts`); `ListedTitle`, `Listed`.
- Produces: `findListed(doc: Document, titles: ListedTitle[], now: Date): Listed[]`.

- [ ] **Step 1: Write failing tests:**
  - Rows "HW11 (10.3, 12.1) | Due Nov 11 at 11:59 PM | 10 pts" and "HW12 (12.2) | Due Nov 18 at 11:59 PM" with titles `HW11 (10.3, 12.1)` and `HW12 (12.2)` → two entries with those dates and the row as evidence.
  - Words must match whole: title `HW 1` does not match a row "HW 11 … Due Nov 11" (compare lowercase alphanumeric word runs; the title's words must appear in order, next to each other).
  - A title found in two rows with different dates → no entry. The same date twice → one entry.
  - A row with the title but no "Due" date → no entry. A date in a different row → no entry.
  - Titles shorter than 2 words and 4 characters → never matched.
  - A label-and-value layout in small blocks (`<div><div>HW 5</div><div>Due: Nov 12</div></div>`) is matched through `compactBlocks`.
  - `dueVisits`: two undated homework topics of one course each carry both titles; a topic of another course carries only its own.
- [ ] **Step 2: Run** `npx vitest run tests/visits/listed.test.ts tests/visits/schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `findListed` and the wiring. Window mode ignores `visitListed` (unchanged).
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: take every listed assignment date from one page`.

### Task 8: Automatic by default, settings, visit log mode

**Files:**
- Modify: `src/core/types.ts` (`DEFAULT_SETTINGS.visits = 'auto'`), `src/background/install.ts`, `src/entrypoints/background.ts` (`onInstalled` passes `details.previousVersion`), `src/entrypoints/options/Settings.tsx`, `src/ui/i18n.tsx`, `src/entrypoints/diagnostics/VisitLog.tsx`, `src/storage/store.ts` (`StoredVisitLogEntry.mode?`)
- Test: `tests/background/install.test.ts`, `tests/ui/settings.test.tsx`, `tests/ui/visitLog.test.tsx`

**Interfaces:**
- Produces: `settingsAfterUpdate(settings: Settings, previousVersion: string | undefined): Settings` in `install.ts`: `visits: 'manual'` becomes `'auto'` when `previousVersion` is below 1.4.0; everything else unchanged.

- [ ] **Step 1: Write failing tests:**
  - `settingsAfterUpdate`: from `1.2.4` with `manual` → `auto`; with `off` → `off`; from `1.4.0` or `1.4.1` with `manual` → `manual` (Review Focus 5); `undefined` previous version → unchanged.
  - A fresh store has `visits: 'auto'`.
  - Settings page: the select's options read "Automatically, in the background", "Only when I click Refresh", "Never"; a checkbox labeled "Use a small minimized window for pages that can't be read in the background" is checked by default and saves `windowFallback`.
  - Visit log: a "Mode" column shows "Background" for `mode: 'frame'` and "Window" for `'window'` or a missing mode.
- [ ] **Step 2: Run** `npx vitest run tests/background/install.test.ts tests/ui`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** The update handler saves `settingsAfterUpdate(...)` only when it changed something.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`. Expected: PASS (update tests that assumed the `manual` default).
- [ ] **Step 5: Commit** `feat: automatic reading by default; window-fallback setting; log shows the mode`.

### Task 9: Sign in, then straight to the dashboard

**Files:**
- Create: `src/background/login.ts`
- Modify: `src/entrypoints/background.ts` (router entry `beginLogin`; `tabs.onUpdated` and `tabs.onRemoved` listeners), `src/ui/components/Onboarding.tsx`, `src/ui/i18n.tsx`, `src/storage/store.ts` (`setLoginTab`/`getLoginTab` in `storage.session`)
- Test: `tests/background/login.test.ts`, `tests/ui/app.test.tsx` (or the existing onboarding tests)

**Interfaces:**
- Produces:
  - `loginReturn(url: string | undefined): boolean`: true for `https://purdue.brightspace.com/d2l/…` pages that do not match `SIGN_IN`.
  - `beginLogin(tabId: number, deps: { signedIn(): Promise<boolean>; navigate(tabId: number, url: string): Promise<void>; remember(tabId: number | null): Promise<void> }): Promise<{ signedIn: boolean }>`.
  - `onTabUpdated(tabId: number, url: string | undefined, complete: boolean, deps: { remembered(): Promise<number | undefined>; navigate; remember; dashboardUrl: string }): Promise<void>`.

- [ ] **Step 1: Write failing tests:**
  - `loginReturn`: true for `/d2l/home` and `/d2l/home/123`; false for `/d2l/login`, for `login.purdue.edu`, for a Duo page, for another site, for `undefined`.
  - `beginLogin` when signed in: `{ signedIn: true }`, no navigation, nothing remembered.
  - `beginLogin` when signed out: navigates the tab to `https://purdue.brightspace.com/d2l/home`, remembers the tab, returns `{ signedIn: false }`.
  - `onTabUpdated`: for the remembered tab, complete, on a return page → navigates it to `dashboardUrl` (`/dashboard.html?start=1`) and forgets the tab. Another tab, an incomplete load, or a sign-in page → nothing. Closing the remembered tab forgets it.
  - Onboarding: one primary button "Log in to Brightspace". Clicking it sends `beginLogin`; on `{ signedIn: true }` the sync starts (the existing `start()`); on `false` nothing more happens in this page.
  - Onboarding opened with `?start=1` starts the sync on mount, once, and removes the parameter from the address.
- [ ] **Step 2: Run** `npx vitest run tests/background/login.test.ts tests/ui`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** The old two-step list ("Open Brightspace", "Start sync") is replaced by the one button; the sync report and errors show as today.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: log in to Brightspace, return to the dashboard, start syncing`.

### Task 10: End-to-end checks, docs and the 1.4.0 trial build

**Files:**
- Modify: `scripts/e2e-frames.cjs`, `scripts/e2e/mock-sites.cjs`, `docs/privacy.html`, `store/listing.md`, `store/firefox-listing.md`, `CHANGELOG.md`, `package.json` (1.4.0), `docs/guide/05-firefox.md`, the spec's status line
- Create: `docs/guide/06-trial-1.4.md`

- [ ] **Step 1: Add e2e checks** to `e2e-frames.cjs` (a full sync through the dashboard, as `e2e-visits.cjs` does):
  - an automatic sync dates a homework whose platform page refuses framing, and no window or tab opens;
  - a homework whose platform never loads in a frame (the mock answers frames with an error page when the request has no tab, and normally otherwise) is dated in the same automatic sync through the minimized window, which closes afterwards; with `windowFallback` off, no window opens and the item stays undated;
  - a list page dates three homeworks of one course from one visit (the log has one frame entry for them);
  - the first-run page: "Log in to Brightspace" while signed in starts the sync; while signed out the tab goes to Brightspace and, after the mock sign-in, comes back to the dashboard and syncs;
  - no "Allow" banner appears for a registry platform; one appears for the unknown-site mock;
  - the visit log shows "Background" and "Window" entries.
- [ ] **Step 2: Run** `npm run e2e:frames` and `npm run e2e:visits`. Expected: both end with "all checks passed".
- [ ] **Step 3: Update the docs** as the spec's section 10 lists. Store descriptions keep naming platforms generically. `06-trial-1.4.md` is the trial checklist of spec 11.3: install, sign in, wait for the first sync, download the visit log, what to look for (Mode per platform), and how to turn the window off.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, `npm run zip`, `npm run zip:firefox`, `npm run lint:firefox`, and the CJK check on the branch diff: `git diff main | python3 -I -c "import sys,re;print('CJK' if re.search('[\\u4e00-\\u9fff]',sys.stdin.read()) else 'clean')"`. Expected: all pass; `.output/dueboard-1.4.0-{chrome,firefox,sources}.zip` exist; lint `errors 0`; `clean`.
- [ ] **Step 5: Commit** `release: 1.4.0 trial build (background reading)`. Do not merge or submit to a store: the trial on a real account comes first.
