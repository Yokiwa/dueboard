# DueBoard design document

- Date: 2026-11-04
- Status: approved; implemented (see the change log at the end for how the product evolved)
- UI mockup: https://claude.ai/artifact/XWfaHHvt7Ps131t3qctoyZ (board "Final: A + next-deadline banner")

---

## 1. Background and goals

To see their homework, Purdue students sign in to Brightspace and click into each course one by one. Many assignments and textbooks also live on other platforms — Gradescope, WebAssign, Pearson, McGraw-Hill, Piazza/Ed, course websites — each with its own sign-in.

**DueBoard is a Chrome extension** that shows every course's assignments, due dates, textbooks and platform shortcuts on one page.

### Success criteria (first release)

1. The author uses it for a week: no Brightspace or Gradescope assignment is missing and every due time is right.
2. Of 5–10 beta testers, at least half still use it after two weeks.
3. The dashboard shows data within 1 second of opening (cached data first, then a background sync).
4. A failed sync on any one platform never makes the whole page unusable.

### Users

- Phase 1: the author and classmates (Purdue University, West Lafayette).
- Phase 2: all students (launch at the start of the Spring 2027 semester).
- Mostly on laptops and desktops (Chrome / Edge).

---

## 2. Scope

### 2.1 In the first release

| Feature | Description |
|---|---|
| New-tab dashboard | *(Original plan; replaced in iteration 2 by a dashboard page opened from the toolbar — see the change log.)* |
| Toolbar popup | Compact view: next deadline + the 5 nearest to-dos + "Open full dashboard" |
| Next-deadline banner | The nearest unfinished item at the top of the dashboard, with a live countdown and an *Open* button |
| Course cards (home) | One card per course: code, name, color dot, the next 2–3 items with countdown badges, and platform shortcut buttons. Opening a card shows all of the course's items and links |
| Calendar | Week and month views; every deadline in its course color |
| To-do list | All items by due date; tick items done by hand; detected submissions are ticked automatically |
| Read Brightspace | Courses, assignments, quizzes, calendar events, and textbook / platform links in course content |
| Read Gradescope | Courses, assignments, due dates, submission status |
| Add by hand | Assignments DueBoard can't read (e.g. on WebAssign) and links such as course websites or Piazza/Ed, saved locally |
| Settings | Show / hide courses, course colors, merge courses by hand |
| Sync status | "Synced · 5 min ago", per-platform status, a *Refresh* button |
| Feedback | A "Send feedback" link in Settings to a Google Form (created before the beta) |

### 2.2 Not in the first release

- Reminders before deadlines (planned for a later version)
- Mobile app / website version
- Grades
- Reading assignments directly from WebAssign / Pearson / McGraw-Hill (shown automatically when instructors put due dates into Brightspace; otherwise added by hand) — *Pearson MyLab and WileyPLUS were added in iterations 4–5*
- Schools other than Purdue (`purdue.brightspace.com` only)
- Cloud sync / accounts

---

## 3. UI design

The mockup board "Final: A + next-deadline banner" is the reference.

- **Style:** clean and minimal. Light gray background (#F7F8FA), white cards, 1 px light borders, 14 px corner radius.
- **Type:** Inter; the countdown uses JetBrains Mono (monospaced).
- **Color:**
  - Each course gets a color (changeable in Settings), used only on small elements such as the course dot and calendar chips.
  - Due badges: within 48 hours red (#FEE2E2 background / #B91C1C text); within 7 days amber (#FEF3C7 / #92400E); later gray.
  - Next-deadline banner: light amber background (#FFF8EB), amber border, countdown text #B45309.
- **Layout (top to bottom):** date + greeting + sync status → next-deadline banner → view tabs (Courses / Calendar / To-do) + summary chips → main area.
- **Card order:** by the due time of each course's nearest unfinished item; courses with nothing due come last and say "Nothing due soon".
- **Responsive:** the card grid uses 1–4 columns depending on window width.
- **Accessibility:** text contrast at least 4.5:1; everything clickable is a real button or link and works with the keyboard.
- **Dark mode:** not in the first release; every color is a design token so it can be added later.

*(The UI was redesigned before the public 1.0.0 release; the structure above still holds.)*

---

## 4. Architecture

### 4.1 Technology

| Purpose | Choice | Why |
|---|---|---|
| Language | TypeScript | Type checking catches mistakes early |
| Extension framework | WXT | Handles Manifest V3 configuration; hot reload in development |
| UI | React + Tailwind CSS | Well documented, fast to build with |
| Dates | date-fns | Time zones, countdowns, "in 3 days" labels |
| Tests | Vitest | Works well with WXT, fast |
| UI text | A small message module (`src/ui/i18n.tsx`) | All strings in one place; English only since 1.0.0 |

### 4.2 Modules

```
src/
├─ connectors/          ① collection: one module per platform, independent of each other
│  ├─ brightspace/
│  ├─ gradescope/
│  └─ pearson/
├─ capture/             notes due dates on platform pages the student opens (WileyPLUS)
├─ core/                ② merging: shared data shapes, course matching, de-duplication, ordering, platform discovery
├─ storage/             ③ local storage: chrome.storage.local
├─ sync/                scheduling: when to sync, per-platform sync status
├─ background/          message routing, which platforms to sync, install handling
├─ entrypoints/         ④ UI entry points (WXT convention)
│  ├─ dashboard/        full dashboard page
│  ├─ popup/            toolbar popup
│  ├─ options/          settings page
│  ├─ diagnostics/      troubleshooting page
│  ├─ background.ts     background: scheduled sync
│  ├─ offscreen/        HTML parsing for the background (see 4.5)
│  └─ wiley.content.ts  WileyPLUS due-date capture
└─ ui/                  shared components (course card, countdown, calendar…)
```

Every connector exposes one function:

```ts
interface Connector {
  id: SourceId; // 'brightspace' | 'gradescope' | 'pearson'
  fetchAll(): Promise<ConnectorResult>;
}

type ConnectorResult =
  | { ok: true; courses: RawCourse[]; items: RawItem[]; links: RawLink[]; partial: string[] }
  | { ok: false; reason: 'not_logged_in' | 'network' | 'parse_error'; detail?: string };
```

The UI and the merge logic don't care which platform or method the data came from.

### 4.3 Shared data shapes

```ts
interface Course {
  id: string;            // DueBoard's internal ID
  code: string;          // e.g. "CS 18000", extracted from the course name
  name: string;          // course name
  sources: { brightspace?: string; gradescope?: string; pearson?: string }; // course IDs on each platform
  color: string;         // display color
  hidden: boolean;
  isCourse: boolean;     // false for Brightspace entries without a course code (orientation, trainings…)
}

interface Item {
  id: string;
  courseId: string;
  title: string;
  type: 'assignment' | 'quiz' | 'exam' | 'event' | 'manual';
  dueAt: string | null;  // ISO 8601 (UTC); shown in local time
  url: string;           // what Open goes to
  sources: ('brightspace' | 'gradescope' | 'pearson' | 'manual')[];
  submitted: boolean;    // submission detected on the platform
  doneByUser: boolean;   // ticked by the student
}

interface CourseLink {
  courseId: string;
  label: string;         // e.g. "Pearson"
  url: string;
  category: 'textbook' | 'homework' | 'discussion' | 'website' | 'lms' | 'other';
  source: 'brightspace' | 'manual';
}
```

### 4.4 Brightspace

- **How:** with host permission for `https://purdue.brightspace.com/*`, call Brightspace's (D2L) REST API with the browser's own sign-in. GET requests only.
- **API versions:** ask `/d2l/api/versions/` which versions the server supports and use the newest `lp` and `le`.
- **What is read:**
  1. Courses: `/d2l/api/lp/{ver}/enrollments/myenrollments/?orgUnitTypeId=3` (paged); only current, not-yet-ended courses.
  2. Assignments: `/d2l/api/le/{ver}/{orgUnitId}/dropbox/folders/` with due dates; for folders due between 7 days ago and 30 days ahead, the student's own submissions decide "submitted".
  3. Quizzes: `/d2l/api/le/{ver}/{orgUnitId}/quizzes/`.
  4. Calendar: `/d2l/api/le/{ver}/calendar/events/myEvents/` (7 days back to 60 days ahead) — deadlines instructors put on the calendar, including other platforms' homework.
  5. Course content links: `/d2l/api/le/{ver}/{orgUnitId}/content/toc`. Platform links are recognized by host and title keywords (Appendix A) and grouped as textbook, homework platform, discussion, and so on.
- **Signed out:** 401/403 or a redirect to the sign-in page → `not_logged_in`.
- **Load:** at most 4 requests at a time; one sync is roughly "courses × 4 + 3" requests.
- **Course codes:** extracted with `([A-Z]{2,5})\s?(\d{3,5})`, e.g. `CS 18000`.

### 4.5 Gradescope

- **How:** with host permission for `https://www.gradescope.com/*`, fetch and parse these pages with the student's sign-in:
  1. `https://www.gradescope.com/account`: the course list (grouped by term; only the newest term).
  2. `/courses/{id}`: the assignment table — title, due time (from the page's time attribute), submission status.
- **Where parsing happens:** every sync runs in the background service worker (pages only ask it to sync). Service workers can't parse HTML, so an offscreen document (reason `DOM_PARSER`) does it.
- **Signed out:** a redirect to the login page, or no course list → `not_logged_in`.
- **Redesigns:** parsing lives in one file and is tested against saved sample pages (section 7).

### 4.6 Merging (core)

1. **Course matching:** a Gradescope course with the same course code as a Brightspace course is the same course. Unmatched Gradescope courses get their own card and can be merged by hand in Settings.
2. **De-duplication:** two items are the same work when all hold:
   - same course;
   - normalized titles (lowercase, no punctuation or spaces) are equal, or one contains the other;
   - due times are at most 1 hour apart.

   After merging: `sources` are combined; `submitted` is true if any source says so; `url` prefers Gradescope's (usually where work is submitted).
3. **Range:** everything due after 7 days ago, plus undated items; overdue unfinished items are marked "Overdue"; finished ones are collapsed.
4. **Order:** unfinished items by due date; undated items last.

### 4.7 Local storage

Everything is in `chrome.storage.local`; nothing is uploaded:

| Key | Content |
|---|---|
| `snapshots` | Each platform's last **successful** raw result (courses, items, links, sync time). A failed sync keeps the previous snapshot, so the UI keeps showing data |
| `manualItems` | Items added by hand (never overwritten by a sync) |
| `manualLinks` | Links added by hand |
| `userState` | "Done" ticks (per source item ID; a merged item is done if any source is ticked), course colors, hidden courses, shown non-course entries, manual merges |
| `captured` | Due dates noted on platform pages the student opened (WileyPLUS) |
| `settings` | Reserved for preferences (empty since 1.0.0) |
| `syncMeta` | Each platform's last success and last error |

Courses, items and links shown in the UI are computed on every read from `snapshots` + manual data + `userState` (4.6); they are not stored separately.

The storage layout has a version number (`schemaVersion`) so future versions can migrate old data.

### 4.8 Sync schedule

- **Opening the dashboard:** cached data shows immediately; if the last sync was more than 5 minutes ago, a background sync starts and the UI refreshes when it finishes.
- **Background:** every 30 minutes via `chrome.alarms`.
- **Manual:** the *Refresh* button.
- Platforms sync in parallel; only one sync runs at a time.

### 4.9 Permissions

| Permission | Purpose |
|---|---|
| `storage` | Keep data |
| `alarms` | Scheduled sync |
| `offscreen` | Parse Gradescope and Pearson pages in the background |
| `activeTab`, `scripting` | Developer tools: export the current page, only when the student clicks |
| `https://purdue.brightspace.com/*` | Read Brightspace |
| `https://www.gradescope.com/*` | Read Gradescope |
| `https://mylab.pearson.com/*` | Read Pearson MyLab |
| Content script on `https://education.wiley.com/*` | Note WileyPLUS due dates |

No "read all sites", `tabs` or `cookies` permission.

---

## 5. Error handling

| Situation | What the student sees |
|---|---|
| A platform's sign-in expired | A banner such as "Gradescope needs you to sign in again" with a button that opens the sign-in page; other platforms keep working. Only shown for platforms the student actually uses |
| Network failure, or a platform redesign breaks parsing | Last good data stays, marked "Gradescope sync failed · showing data from 2 h ago", with expandable details |
| First install, no data yet | A welcome page: sign in to Brightspace, then *Start sync* |
| One course's request fails | The rest of that course and all other courses still show; the card says "Some data did not sync" |
| Local storage fails | An error message instead of a crashed page (an error boundary wraps the UI) |

---

## 6. Privacy and compliance

- All data stays in the student's browser; nothing is uploaded, collected or analyzed.
- DueBoard never touches or stores passwords; it reuses the browser's existing sign-ins.
- Only GET (read) requests, at a low rate (every 30 minutes).
- No "Purdue" in the name or logo, no university seal or colors; the description may say "made for Purdue students" and notes it is not an official product.
- Before the public launch, read Purdue IT's acceptable-use rules; email IT if needed.
- A privacy policy page is hosted on GitHub Pages.

---

## 7. Testing

1. **Automated (Vitest)**
   - connectors: anonymized real Brightspace API responses and Gradescope / Pearson pages as fixtures; check the parsed result.
   - core: course matching, de-duplication, order, range, labels like "in 3 days", platform discovery.
   - storage: layout migration.
   - end-to-end (Playwright, headless Chromium): only Brightspace data is provided; the extension must discover the student's other platforms on its own.
2. **Manual:** the author uses a real account for a week and compares with every platform.
3. **Beta:** 5–10 students from different majors.

Fixtures are exported by the author from their own browser with personal data removed, and live in `tests/fixtures/`.

---

## 8. Release

1. Code on GitHub, public repository, MIT license.
2. GitHub Pages hosts the website and the privacy policy.
3. A Chrome Web Store developer account (one-time US $5).
4. Publish as Unlisted first (link-only) for the beta; switch to Public once stable.
5. Versions follow `major.minor.patch` (e.g. 1.0.0), each with release notes.
6. Optional: the Microsoft Edge Add-ons store.

---

## 9. Launch plan

| When | Phase | What |
|---|---|---|
| November 2026 | Build | Finish the first release; the author uses it |
| Early December (before finals) | Beta | 5–10 classmates; feedback through a form |
| December (winter break) | Prepare | Fix issues; build the most requested feature (probably reminders); demo video or GIF, store screenshots, website |
| First week of the Spring 2027 semester | Launch | Student group chats and clubs, course Discord / GroupMe servers, Reddit r/Purdue |
| After | Operate | Check weekly users in the developer console; keep improving from feedback |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| The browser blocks background requests carrying the student's sign-in | Verified first in development (it works); fallback would be requesting from an open platform tab, or Brightspace's iCal feed |
| Purdue's Brightspace disables some endpoints or runs different versions | Query supported versions at start; skip unavailable endpoints and use the rest |
| A Gradescope or Pearson redesign breaks parsing | Parsing is isolated and tested; cached data shows with a notice; a fixed version updates users automatically |
| The school or a platform objects to this kind of extension | Check policies before launch; DueBoard is read-only, low-rate and uploads nothing |
| The author is new to software and maintenance is hard | Small modules, clear comments, automated tests on the core logic, a guide for every step |

---

## Appendix A: recognizing platform links

| Category | Label | Host keywords |
|---|---|---|
| homework | Gradescope | `gradescope.com` |
| homework | WebAssign | `webassign.net` |
| homework | Achieve | `macmillanlearning.com` |
| homework | Pearson | `pearson.com`, `mylab`, `mastering` |
| homework | McGraw-Hill Connect | `mheducation.com` |
| homework | WileyPLUS | `wileyplus.com`, `wiley.com` |
| textbook | Cengage | `cengage.com` |
| textbook | zyBooks | `zybooks.com` |
| discussion | Piazza | `piazza.com` |
| discussion | Ed | `edstem.org` |
| website | (link title) | any other external link |

Brightspace external-tool (LTI) launches don't show the platform in their URL, so they are recognized by title keywords (Pearson, Connect, WebAssign, Achieve, Wiley…).

---

## Change log

Pre-release iterations during the author's trial, then the public release.

### Iteration 2 (from the author's trial)
- **No new-tab takeover:** the dashboard is an extension page (`dashboard.html`) opened from the popup's "Open full dashboard"; it opens once on install to show the welcome guide. The new-tab setting was removed and the manifest no longer declares `chrome_url_overrides`.
- **Done state:** ticked items stay in place with a strike-through on cards and in the to-do list; only finished items past their due time leave the card or fold into "Completed". The banner's *Done* button keeps its undo notice.
- **Cards show dated items only;** undated ones (such as old quizzes) appear in the course details and the to-do list's "No due date" group.
- **Non-course entries hidden by default:** Brightspace entries without a course code (orientation, trainings, tutoring programs) are hidden and can be shown in Settings (`userState.shown`). Gradescope courses always count as courses.
- **Course titles** drop numeric section lists.
- **Platform shortcuts:** WileyPLUS recognized; Brightspace quickLinks (`type=lti`) and content-topic pages count when the title names a known platform; content topics without a URL use their content page.

### Iteration 3
- Collapsible **Developer tools** in the popup: **Export this page** (`activeTab` + `scripting`; reads the current tab only on click, anonymizes, downloads locally) and **Export course links**. Used to collect real Pearson and Wiley page structures.

### Iteration 4
- **Pearson MyLab connector:** reads `https://mylab.pearson.com/Student/DoAssignments.aspx?view=all` and parses the assignment table (due `MM/DD/YY` + `h:mmam/pm`, in browser local time). Past-due rows that can no longer be worked count as done. Synced only when a course links to Pearson (or Pearson returned data before). An expired session asks the student to open Pearson once from Brightspace, through that course's Pearson launch link; items open through the same link. Pearson attaches to the course with the Pearson link, or gets its own card.
- **Brightspace offerings sharing a course code (LEC + REC) share one card,** keyed by the LEC.
- **Homework launches in course content become items:** external-tool topics titled "HW + number" or "Homework + number", excluding "Copy of", "study purposes", "practice" and "solutions". The date comes from the topic, or from a calendar event with the same title.
- Macmillan Achieve recognized.

### Iteration 5
- **WileyPLUS "note it when opened":** a content script on `education.wiley.com` reads the page heading and the line "Due Monday, Nov 9 at 11:59 PM (EST)" (year closest to today, zone abbreviation converted) when the student opens an assignment, and sends it to the background. The background accepts only messages from `education.wiley.com` with a title of at most 300 characters and a date within a year, and stores them in `captured` by normalized title. `buildDashboard` fills in undated items with the same title (e.g. "PHYS 172H - HW11 - FA26"); dated items keep their own date. Limitation: each assignment must be opened once.
- Pearson requests don't follow redirects (a redirect to sign-in reports `not_logged_in`); failed-sync banners can be expanded for details.

### 1.0.0 — first public release
- **Redesigned UI** (new visual style, icon set and layout).
- **English only:** the Chinese interface and the language setting were removed.
- **Brightspace is the only sign-in.** The welcome page asks only for Brightspace. Platforms are discovered from the student's Brightspace courses (`platformsInBrightspace`). Gradescope is checked quietly every sync, because many courses use it without linking it from Brightspace; Pearson is synced only once a course links it. Sign-in prompts appear only for platforms a course links to or that returned data (`relevantSources`). A platform discovered by a Brightspace sync is synced in the same run.

### 1.1.0
- Designed in [the 1.1 design](2026-11-07-dueboard-1.1-design.md): due dates from any homework platform through launch visits in a minimized window (platform registry, universal and dedicated finders, visit schedule, per-platform optional site access), Pearson session refresh through Brightspace, syllabus suggestions (Simple Syllabus, PDF and HTML files), and a Firefox build. Implementation notes and every decision taken during the build are in the 1.1 plan and its ledger.
