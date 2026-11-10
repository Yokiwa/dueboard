# DueBoard: background reading, zero-prompt setup, faster sync — design

Date: 2026-11-10 · Status: draft for review · Target version: 1.4.0

## 1. Goal

A student installs DueBoard, signs in to Brightspace once, and lands on a dashboard that fills in every assignment and
due date on its own: no "Allow" prompts per platform, no Refresh needed, and no window or tab ever appearing while
platform pages are read.

Decided with the user:

- **No visible windows.** Platform pages are read inside a hidden page of the extension. A minimized window is only a
  fallback, and only when the student clicks Refresh.
- **Zero prompts after install.** Access to every known homework platform is requested once, at install.
- **Automatic by default.** Everything syncs in the background; Refresh is for "update right now".
- **Sign-in flow:** "Log in to Brightspace" → after sign-in the tab returns to the DueBoard dashboard and the sync
  starts.
- **Platforms:** every platform in the user's Purdue research workbook is known to DueBoard.
- **Speed:** with windows gone, read several pages at once and take every date a page shows.
- **Scores (the parked `feat/scores` branch, "1.3.0") are not part of this.** That branch stays as it is and will get
  a later version number when it is taken up again, together with automatic "done" detection.

Not in this version: reading scores, automatic "done" detection, schools other than Purdue, Safari, and
platform-specific data requests (section 8.4).

## 2. What was tested before writing this

A throwaway probe extension (not in the repository) ran in Chromium against local mock sites:

| Case | Result |
| --- | --- |
| A page that refuses framing (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), loaded in an iframe of the extension's offscreen document | Blocked, as expected |
| The same page with a header rule that applies only to requests outside any tab | Loaded and read by a content script |
| Sign-in cookie (`SameSite=Lax`) set earlier in a normal tab | Sent to the hidden frame |
| LTI-style launch: LMS page auto-posts a form to the platform, which sets a cookie and redirects | Landed and read; the `SameSite=None; Secure` cookie was kept, the `Lax` one set during the cross-site POST was not |
| Date rendered by script one second after load; a frame-busting script on the page | Read after 1.0 s; the frame-buster had no effect |
| Windows and tabs before and after | Unchanged |

Not tested, because it needs a real Purdue account: WileyPLUS, Achieve, Gradescope and the other real platforms, and
Firefox. Section 3.6 (fallback) and section 11.3 (trial) exist for that reason.

## 3. Background reading ("frame mode")

### 3.1 Mechanism

- **Host page.**
  - Chrome: the existing offscreen document, now also created with the `DOM_SCRAPING` reason (Chrome's reason for
    "embed an iframe and read its DOM").
  - Firefox: the background page itself (Firefox MV3 backgrounds have a document).
  - The same module, the *frame host*, runs in both.
- **One iframe per visit.** The frame host loads the item's Brightspace launch link in an iframe, exactly the link a
  window visit opens today. The platform signs the student in through Brightspace as before.
- **Header rule.** A `declarativeNetRequest` session rule removes `X-Frame-Options` and `Content-Security-Policy` from
  `sub_frame` responses whose request belongs to no tab (`tabIds: [-1]`).
  - Requests in the student's tabs are never touched.
  - The rule exists only while a run is in progress.
- **Reader.** The existing finder (`runFinder`) becomes a declared content script on Brightspace and the platform
  hosts, in all frames. It does nothing unless it is inside the frame host:
  - it sends a hello with `window.top.postMessage(msg, <extension origin>)`, which is delivered only when the top
    page is the extension's own;
  - the frame host works out which iframe the hello came from (by walking the sender's `parent` chain) and answers
    with the visit's mode, platform and titles;
  - results go back the same way. No message goes to any website.
- **"Open the assignment" buttons** work as today. The page-side helper that turns `window.open` into "navigate this
  frame" is added by the reader as a web-accessible script, only inside the frame host.
- **Nothing else changes** about what is read or pressed: the finder, the open-button rules, the "never open quizzes
  or exams" rule and the sign-in checks are reused.

### 3.2 Flow of one frame visit

1. The background asks the frame host: `{ token, url, mode, platform, titles, timeoutMs }`.
2. The frame host adds an iframe and waits for the first hello from the iframe's own document. Its address (query
   removed) is the landing page.
3. Readers in that iframe and its sub-frames run as in a window visit: a date as soon as one is found; "nothing" from
   the landing frame at its time limit; a page sample for the log.
4. The frame host answers the background with one result, then removes the iframe:
   - `found` (date, title, evidence, landing host);
   - `none` (a reader ran, no date);
   - `blocked` (no reader said hello within 20 s: the page didn't load here, or is on a site DueBoard can't read);
   - `signed_out` (the landing page is a Brightspace sign-in page).
5. The background turns the result into the existing visit outcomes. `blocked` becomes `failed` with reason
   `frame`.

### 3.3 Several pages at once

- Up to 3 frame visits run at the same time.
- Never two for the same platform at once (same registry id, or same course when the platform is unknown): two
  simultaneous launches could mix up one platform session.
- Window visits stay one at a time.

### 3.4 Limits

| | Frame mode | Window mode (unchanged) |
| --- | --- | --- |
| Pages per run | 60 | 25 |
| Time budget per run | 8 minutes | 5 minutes |
| Per page | 20 s for the hello, then the finder's existing limits | as today |

The recheck rules do not change: new undated work first; a found date again after 24 hours when due within 3 days,
else after 3 days; quizzes and exams never opened.

### 3.5 Results appear as they are read

Today a run saves its results at the end. Results are now saved after each visit, so dates show up on the dashboard
one by one while the run continues, and a run that is cut short keeps what it read.

### 3.6 Fallback and learning

- **Automatic syncs never open a window.** If frame mode can't read a page, the item simply stays undated until a
  Refresh.
- **On Refresh**, items whose frame visit ended `blocked` or `none` are tried again in a minimized window, as in
  1.2.4, unless the student turned that off (section 9).
- **Per platform memory:** after 3 frame visits in a row to a platform end `blocked` with none succeeding, frame mode
  is skipped for that platform for 7 days (straight to the window on Refresh, nothing on automatic syncs).
- **Visit log:** every entry records `mode: 'frame' | 'window'`, so a log from a real account shows which platforms
  work in the background.
- **Unknown platforms** (not in the registry) keep the 1.2.4 behavior: the banner asks for access to that site, and
  after "Allow" it is read in a window on Refresh.

### 3.7 Firefox

- Same frame host in the background page; header rule through Firefox's `declarativeNetRequest`.
- This cannot be run in the build environment. If frame mode fails there, Firefox behaves like 3.6: no windows on
  automatic syncs, window fallback on Refresh. A Firefox tester decides whether more work is needed.

## 4. Permissions at install

- `host_permissions` lists Brightspace and every host of every registry platform (section 7), built from the
  registry so the two cannot drift apart. `*.aleks.com` becomes `https://*.aleks.com/*`.
- Each platform's entry covers its whole domain, including its sign-in pages (for example `*.wiley.com`,
  `*.macmillanlearning.com`, `*.pearson.com`), because a launch passes through them.
- New permission: `declarativeNetRequestWithHostAccess` (no install warning; it only works on the hosts above).
- `optional_host_permissions: https://*/*` stays, for unknown platforms only.
- **What students see:**
  - New installs: one install prompt listing the sites. Nothing afterwards.
  - Existing installs: the browser disables the update until the student accepts the new site list, once.
- The per-platform "Allow" banner no longer appears for registry platforms. Settings still lists site access and lets
  the student remove optional grants.

## 5. First run

1. The first-run page has one primary button: **Log in to Brightspace**.
2. On click, DueBoard checks whether Brightspace is already signed in.
   - Signed in: the sync starts at once, on this page.
   - Not signed in: this tab goes to Brightspace's sign-in page, and DueBoard remembers the tab.
3. When that tab reaches a signed-in Brightspace page, DueBoard sends it back to the dashboard and starts the sync.
   If the student closes the tab or navigates elsewhere, nothing happens; the dashboard offers the button again.
4. The first sync is a full one: Brightspace, Gradescope, Pearson, syllabi, then frame visits for every undated
   homework. Courses and Brightspace dates show first; platform dates fill in (section 3.5).

## 6. Automatic by default

- `settings.visits` defaults to `auto`. On update to 1.4.0, a stored `manual` becomes `auto` once (it was the old
  default and windows no longer appear); `off` is kept.
- The 30-minute background sync includes frame visits for items that are due for a visit.
- Refresh does the same, immediately, plus the window fallback of 3.6.

## 7. Platforms

The workbook lists 22 platforms. Brightspace and 9 others are already known. Added:

| Platform | Kind | Dates read? | Opened automatically? |
| --- | --- | --- | --- |
| LabFlow | Lab homework | Yes (universal reader) | Yes |
| BeyondLabz | Virtual labs | Yes (universal reader) | Yes |
| Circuit | Peer review (Purdue) | Yes (universal reader) | Yes |
| Variate | STEM assessment (Purdue) | Yes (universal reader) | Yes |
| Campuswire | Discussion | No | No |
| iClicker | In-class polling | No | No |
| Google Forms | Forms | No | No |
| Turnitin | Originality reports inside Brightspace | No | No |
| ExamSoft / Examplify | Exams | No | Never |
| Respondus LockDown Browser | Exam security | No | Never |
| Honorlock | Proctoring | No | Never |
| Examity | Proctoring | No | Never |

- "No" rows are recognized so their links become course shortcuts with the right label; they have reader `none`.
- Exam and proctoring tools get a new registry flag `neverOpen`, checked next to the existing title rule
  (`NEVER_OPEN`), so no visit of any kind opens them.
- The 15 platforms DueBoard already knows beyond the workbook stay.
- Hosts for Circuit and Variate are taken from their Purdue launch pages during implementation; if they cannot be
  confirmed, those two are recognized by title only and read after the usual "Allow" for an unknown site.

## 8. Speed

### 8.1 Where time goes today

One page at a time, in a window: 5 to 15 s when a date is found, about 22 s when not; 22 pages take several minutes.

### 8.2 In this version

- **Parallel frame visits** (3.3): up to 3 at once.
- **Every date a page shows.** A visit carries the titles of the other undated items of the same course. When the page
  it lands on is a list ("HW11 … Due Nov 11 at 11:59 PM", "HW12 … Due Nov 18 …"), each listed title with its own date
  is captured:
  - a title matches by the existing normalized-title comparison, and must match exactly one line or block;
  - the date must be in the same line or small block as the title;
  - a title that appears with two different dates is skipped.
  Items dated this way need no visit of their own in this run.
- **Progressive results** (3.5): the student sees dates as they arrive.

### 8.3 Expected effect

For the user's own courses (WileyPLUS, Achieve, a Gradescope-based course): roughly a third of the time from parallel
reading alone, less wherever a platform lands on a list. These are estimates until the trial (11.3).

### 8.4 Later

Asking a platform for its assignment data directly (one request per course, no page at all) is the fastest option, but
it is specific to each platform and needs page exports from real accounts. It gets its own design after 1.4.0, starting
with the platforms the visit log shows as slowest.

## 9. Settings and interface

- **Reading platforms** (existing select), new wording:
  - "Automatically, in the background" (default);
  - "Only when I click Refresh";
  - "Never".
- New checkbox, on by default: "On Refresh, use a small minimized window for pages that can't be read in the
  background".
- The progress line ("Reading 3 of 22 platform pages…") stays and now also shows during automatic syncs.
- Diagnostics visit log: a "Mode" column (Background / Window).
- First-run page: section 5.
- The platform access banner shows only for unknown platforms.

## 10. Privacy policy and store listings

- Privacy policy:
  - platform pages are read in the background inside the extension, without a window;
  - by default this happens automatically (with the existing recheck rules), not only on Refresh;
  - access to the listed platform sites is granted at install;
  - while a page is read in the background, DueBoard removes the "do not embed" headers from that one hidden request;
    the student's own tabs are never affected.
- Chrome listing, permission justifications:
  - `offscreen`: also embeds the student's own assignment pages to read their due date (`DOM_SCRAPING`);
  - `declarativeNetRequestWithHostAccess`: the header rule above, limited to requests outside any tab;
  - host permissions: one line per platform site, "read the due date on the student's own assignment pages".
- Listing descriptions keep naming platforms generically (the store rejected brand lists as keyword spam).
- Firefox listing and reviewer notes: the same points.

## 11. Testing

### 11.1 Unit

- Frame host: iframe attribution by parent chain; one result per visit; `blocked` at the hello timeout; iframe
  removed afterwards.
- Reader: silent in a normal tab (top page is not the extension); hello and results only to the extension origin.
- Runner: frame outcomes mapped to visit outcomes; concurrency never runs two visits of one platform together;
  results saved after each visit; limits of 3.4.
- Fallback: automatic syncs never produce window targets; Refresh retries `blocked` and `none` items in a window;
  per-platform skip after 3 blocked.
- List capture: the three rules in 8.2, with the saved Achieve list export.
- Registry: new platforms, `neverOpen`, manifest host list generated from the registry.
- Settings migration: `manual` → `auto` once; `off` kept.
- First run: already signed in → sync; sign-in tab returns to the dashboard; closed tab → nothing.

### 11.2 End-to-end (Chromium)

- Mock sites are served by a local HTTPS server reached through Chromium's host-resolver rules, because request
  routing in the test tool may not see frames of the offscreen document. This is verified as the first step of the
  plan; the existing window-mode checks keep running.
- New checks:
  - a platform page that refuses framing is read with no window or tab opened;
  - an automatic sync reads dates and opens nothing;
  - a page that cannot load in a frame is read in a window on Refresh, and not on an automatic sync;
  - a list page dates three items from one visit;
  - the first-run flow ends on the dashboard with a sync running;
  - no "Allow" banner for a registry platform.

### 11.3 Trial on real accounts (before any store submission)

- A 1.4.0 build is given to the user first.
- The user installs it, signs in, waits for the first sync, then sends the visit log from Diagnostics.
- The log shows, per platform, whether Background mode read the date. Platforms that only work in a window are fixed
  or left on the window fallback, and the user decides whether that is good enough to publish.
- A Firefox tester does the same.

## 12. Risks

- **A real platform does not work inside a frame** (its sign-in cookies, or a script that insists on a top-level
  page). Handled by 3.6; found by 11.3. This is the main unknown.
- **Store review.** Removing embedding headers and a long site list will be looked at closely. The justifications say
  exactly what the rule does and that it never applies to the student's tabs. A rejection would delay the store
  release, not the trial.
- **Existing users must re-accept permissions once** (section 4).
- **More background activity.** Automatic syncs now open platform pages (invisibly) under the existing recheck rules;
  platforms may record these as visits, as they already do for window visits.
- **Firefox** is unverified until a tester runs it (3.7).
