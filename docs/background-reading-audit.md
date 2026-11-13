# Background reading audit — November 12, 2026

## Result and limits

Version 1.5.3 uses background fetches and sandboxed hidden frames only. It removes the 1.5.2 first-connection foreground fallback described in the historical notes below. Automatic sync never navigates the dashboard or creates browser tabs or windows. This policy applies to all registered platforms and unknown launch targets, including installations that stored `windowFallback: true`. It does not establish successful invisible reading on every platform.

The existing code already supported hidden frames; the visible behavior came from `runVisitPass` falling back to `runVisits`, and its seven-day memory routing failed platforms straight to a minimized window. The change removes that fallback from the sync pipeline, rejects legacy window creation at the browser API boundary, ignores old frame-skip verdicts, disables the obsolete saved option, and removes its checkbox. Earlier results are saved individually; failed reads retain existing dates. Page limits, per-platform serialization, permission checks, and sign-out handling remain in the frame runner. Old visit-window cleanup remains for upgrades.

## Reading strategy

1. Read Brightspace's own assignment, quiz, content and calendar data.
2. Reuse the existing authenticated background connectors for Gradescope and Pearson MyLab.
3. Run other Brightspace launch links inside the existing hidden frame host: an offscreen document on Chromium, the background page on Firefox. Existing code redirects popup-style assignment launches into the same frame, and a sandbox forbids popups and navigation of the top page.
4. If the page cannot authenticate or function in that context, record a failed read and preserve existing data. A student can sign in themselves and retry; that does not guarantee the platform will support frames.

Chrome explicitly supports offscreen documents for DOM scraping without tabs or windows. However, embedding is not equivalent to running a top-level page. Cookie settings, JavaScript cookie access, storage partitioning, intermediate identity providers, frame checks and platform launch behavior can still break an invisible visit. Removing embedding response headers cannot fix every one of these conditions.

A complete solution for platforms that cannot run in frames requires a verified read endpoint or reading a page the student has already opened. The latter creates no tabs, but does require course/item correlation, sender validation, and platform-specific readers. Current passive capture is limited to WileyPLUS's `education.wiley.com` pages and title matching; it must not be represented as universal capture. There is no newly implemented vendor API in this change.

## Registry coverage

The following records describe existing implementations, not successful live-account certification. Each platform with a reader has a regression case proving that a blocked hidden read cannot invoke the old window fallback. None of the authenticated live services was tested with a student's account in this task.

| Platform | Existing reader | Remaining verification or gap |
| --- | --- | --- |
| Brightspace | Direct API connector | Purdue session required; only `purdue.brightspace.com` supported |
| Gradescope | Authenticated HTML fetch; hidden-frame session launch | Live session renewal and assignment parsing |
| Pearson MyLab / Mastering | MyLab HTML fetch; hidden launch/session reader | Fetch parser targets MyLab, not all Mastering/Revel products; live SSO must be verified |
| WileyPLUS | Dedicated page finder; existing passive capture | Live launch flow and nested assignment page |
| WebAssign | Generic visible-text date finder in hidden frames | Vendor DOM and authentication unverified |
| Achieve | Generic finder | Vendor DOM and authentication unverified |
| McGraw-Hill Connect | Generic finder | Vendor DOM and authentication unverified |
| Cengage / MindTap / OWL | Generic finder | Product-specific DOM and authentication unverified |
| zyBooks | Generic finder | Vendor DOM and authentication unverified |
| ALEKS | Generic finder | Vendor DOM and authentication unverified |
| Norton / InQuizitive / Smartwork | Generic finder | Product-specific DOM and authentication unverified |
| Top Hat | Generic finder | Vendor DOM and authentication unverified |
| Perusall | Generic finder | Vendor DOM and authentication unverified |
| Packback | Generic finder | Vendor DOM and authentication unverified |
| Hawkes Learning | Generic finder | Vendor DOM and authentication unverified |
| Vista Higher Learning | Generic finder | Vendor DOM and authentication unverified |
| Sapling | Generic finder | Vendor DOM and authentication unverified |
| Expert TA | Generic finder | Vendor DOM and authentication unverified |
| Knewton Alta | Generic finder | Vendor DOM and authentication unverified |
| PrairieLearn | Generic finder | Instance domains, DOM and authentication unverified |
| Vocareum | Generic finder | Vendor DOM and authentication unverified |
| GoReact | Generic finder | Vendor DOM and authentication unverified |
| LabFlow | Generic finder | Vendor DOM and authentication unverified |
| BeyondLabz | Generic finder | Vendor DOM and authentication unverified |
| Circuit | Title recognition and generic finder | No host registered: background injection/permissions incomplete |
| Variate | Title recognition and generic finder | No host registered: background injection/permissions incomplete |
| Simple Syllabus | Syllabus reader | Separate suggestion flow, not a homework connector |
| Piazza, Ed Discussion, Campuswire | No deadline reader | Discussion platforms excluded by current registry |
| iClicker, Google Forms, Turnitin | No deadline reader | Current registry excludes these; any deadlines must come from Brightspace or another source |
| ExamSoft, Respondus, Honorlock, Examity | Intentionally never auto-launched | Preserve exclusion; do not launch assessments to scrape dates |
| Unknown/custom course tools | No guaranteed reader | Host discovery and permission/injection coverage incomplete; no window fallback |

Purdue allows instructors to request additional integrations. Its centrally supported list is not an exhaustive inventory of every tool used in every course. Official Purdue materials also document LON-CAPA, absent from this registry (some documentation is historical), and Fort Wayne documents Möbius. The extension currently only connects to West Lafayette's Brightspace hostname; cross-campus support is outside its present implementation. Neither missing tool is silently labeled supported here.

## Acceptance criteria for certifying each service

Use an authorized course session to test the same assignment with an active session, an expired vendor session, a nested Brightspace launch and a popup-style launch. Observe tab/window creation events for the whole refresh; there must be zero. Compare the title, course, date, timezone and completion status to the platform itself. Test missing, conflicting and changed dates; preserve an earlier date on failure. Repeat in each supported browser. Capture sanitized fixtures to add dedicated parsing tests. A platform is certified only after these checks succeed, or after a tested read-only endpoint or existing-page capture adapter is implemented.

## Sources

- [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen): hidden DOM scraping is an explicit supported use.
- [Chrome extension storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies): extension iframe storage and cookie behavior have qualifications.
- [Purdue new Brightspace integrations](https://www.purdue.edu/innovativelearning/tools-resources/instructional-technology/new-brightspace-tool-integration/): course tools extend beyond centrally supported integrations.
- [Purdue instructional toolkit](https://events.purdue.edu/event/explore-purdues-instructional-toolkit): includes Gradescope, Circuit and Variate.
- [Purdue LON-CAPA guide (historical)](https://www.math.purdue.edu/academic/files/courses/2020fall/MA15800/UsingLONCAPA.pdf).
- [Purdue Fort Wayne student resources](https://www.pfw.edu/science/mathematical-sciences/student-resources): describes Möbius homework.

## Verification of this change

- Unit/UI suite: 72 test files, 991 tests passed. Includes a no-fallback regression for every registry entry with a reader, legacy opt-ins, old frame-failed session memory, concurrent saves, interrupted runs and preservation of existing dates.
- TypeScript `tsc --noEmit`: passed.
- Chrome and Firefox production builds: passed. Firefox runtime behavior was not exercised.
- Real Chromium with simulated HTTPS platform pages: passed the end-to-end frame suite, including popup/form launches, embedding headers, Pearson's session handoff, blocked pages, expired sessions, completion scores and user overrides. Tab/window creation events were checked during refreshes and remained empty. This is browser integration testing with mocks, not live vendor certification.
- Dependencies were installed with the bundled pnpm runtime without changing the committed npm lockfile. No changes have been pushed or published.

## 1.5.1 follow-up: missing Physics dates and first Pearson sync

Undated homework is now eligible for a date visit even when Brightspace already reports a score/completion. Wiley's dedicated reader joins date labels and values split across elements and ignores hidden dates. Manually marked done items remain excluded.

Pearson session visits now wait for a stable, rendered assignment table rather than finishing when a MyLab address first appears. They request the all-assignments view inside the same hidden frame. A sanitized, transient copy of the table can feed the existing Pearson parser if worker requests remain signed out; it excludes sign-in inputs and is not recorded in diagnostics. A loading shell no longer counts as a successful empty course. A newly expired session can be renewed immediately after an earlier successful renewal, while failed attempts retain their backoff.

These changes improve the existing MyLab workflow. They do not bypass MFA, consent, vendor-side authentication requirements or a platform that cannot run in a hidden frame. Live account confirmation remains necessary.

## 1.5.2 follow-up from actual visit logs

The supplied log showed Wiley reaching its assessment-player launcher without following the second Open Assignment control. That control's accessible label was "Opens in a new window". Button selection now considers both accessible and visible labels, while rejecting dangerous wording in either representation. Empty popup launches can retain a real sandboxed child document for writes, forms and messaging. Hidden pages use a desktop viewport and multi-stage progress can extend the read deadline within a hard overall limit.

The same log showed Pearson stopping at interop.pearson.com/launch, before its course dashboard. The earlier assignment-table readiness fix cannot solve a launch that never reaches that page. First-connection recovery now has an explicitly different path: if the source has no assignment data and an existing DueBoard dashboard tab is available, that same tab may visit Pearson, follow Assignments and return automatically. It does not create another browser tab/window. This is foreground navigation in the existing tab, not fully invisible reading. Routine background refreshes of an already established Pearson source do not use this path. Recovery is attempted before the longer homework scan, and the user-facing onboarding text explains it.

The raw user log was inspected for diagnosis and was not added to the repository or build.

1.5.2 validation: TypeScript, 1,018 tests, Chrome packaging, Firefox build and the Chromium sync suite passed. Automatic recovery used the original dashboard tab and created no tabs/windows.


## 1.5.3: Pearson gateway coverage; no dashboard navigation

Inspection of the live authenticated launch response found that interop.pearson.com/launch posts its LTI handoff to socket.pearsoned.com/uiservice/opener. The installed extension did not have access to this host. The existing Pearson wildcards do not include pearsoned.com. Add only https://socket.pearsoned.com/* to the registry, which derives host permissions, content-script matches and hidden-frame embedding rules. No real authentication fields or values are retained here.

Remove the first-connection dashboard-navigation helper and all automatic calls to it. Keep the working WileyPLUS reader unchanged. A blocked hidden response remains a reported failure with cached homework retained.

The browser regression fixture models the observed POST chain through Brightspace authenticate, Pearson interop, and socket.pearsoned.com before the Assignments link. It starts with an expired worker session, checks the parsed Math table on first sync, and monitors dashboard URL updates as well as new tabs/windows. Fixture embedding headers are deliberately restrictive test conditions, not observations of the live gateway. This simulated regression does not establish cold-session success against the live vendor; that requires testing the updated extension with its new exact-host access.

1.5.3 validation: TypeScript, 1,014 unit tests, the complete Chromium sync regression, Chrome ZIP integrity/content checks and Firefox build passed. The simulated first sync and failed renewal both recorded zero dashboard URL updates and zero new tabs/windows.


## 1.5.4: handle the Pearson gateway action

The user's 1.5.3 failure log shows the hidden reader reaching socket.pearsoned.com/uiservice/opener. Its page sample asks to open Pearson course materials and lists "Open Pearson (opens in new tab)". No click was recorded. Session mode only recognized Assignments, so it never advanced from the gateway. This confirms a missing action, not proof that all later authentication will succeed.

Session mode now accepts the exact Open Pearson label (including the new-tab/window accessibility suffix) only for Pearson at the exact gateway host and path. It preserves the existing hidden-frame popup/link routing and browser-enforced sandbox; the WileyPLUS reader and host permissions are unchanged. The normal Assignments step and rendered-table readiness checks still follow. Existing update handling already clears failed visit/session backoff, so an updated build can retry old failures.

The regression test first reproduced a missed click in the old reader. The browser fixture now waits for Open Pearson and exercises a delayed blank-popup launch before the existing Assignments step; unit tests cover the direct-link form, delayed rendering and unrelated-action rejection. The live log contains labels and text, not the gateway's exact JavaScript. Those launch mechanisms are tested scenarios, not a captured vendor implementation. Live expired-session confirmation remains necessary.
