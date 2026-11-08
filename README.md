<p align="center"><img src="docs/assets/icon.svg" width="72" alt=""></p>

<h1 align="center">DueBoard</h1>

<p align="center">Every assignment, deadline and course platform from Brightspace — on one page.</p>

<p align="center"><img src="docs/assets/screenshot.png" width="760" alt="DueBoard course cards with a live countdown to the next deadline"></p>

> DueBoard is a student-built, open-source project and is **not affiliated with Purdue University, D2L Brightspace, Gradescope, Pearson, Wiley or any other platform it reads**.

## Why

At Purdue every course lives in Brightspace, but homework is spread across Gradescope, Pearson MyLab, WileyPLUS, ALEKS, InQuizitive, WebAssign and more — each with its own list of due dates. DueBoard collects them so you can see what is due next without clicking through every course.

## What it does

- **One sign-in.** You only sign in to Brightspace. DueBoard reads your courses and discovers which homework platforms they use.
- **Course cards.** Upcoming work per course with countdowns, plus one-click shortcuts to each course's platforms.
- **Next deadline.** The nearest deadline sits on top with a live countdown, an *Open* button and a *Done* button.
- **Calendar and to-do views.** Week and month views; a to-do list you can tick off. Submitted work is ticked automatically where the platform reports it.
- **Any homework platform.** For homework that Brightspace launches on another platform, when you click Refresh DueBoard opens the link in a minimized window, reads the "Due …" line and closes it (or automatically, if you choose that in Settings). You allow each platform once.
- **Dates in titles.** A homework titled "HW11_due_Nov 11" gets that date.
- **Syllabus suggestions.** Dated work found in your syllabus (Simple Syllabus, or a PDF in Content), to add with one click.
- **Automatic sync** every 30 minutes, using the sessions already in your browser.
- **Chrome, Edge and Firefox** (and other Chromium browsers such as Brave, Arc and Opera).

### Where due dates come from

| Platform | How DueBoard gets the due date |
|---|---|
| Brightspace | Assignments, quizzes, calendar events and dated content items, read directly |
| Gradescope | Read from your Gradescope course pages when you are signed in |
| Pearson MyLab & Mastering | Read from MyLab when a course links to Pearson; if the session expired, DueBoard reopens it through Brightspace |
| WileyPLUS, ALEKS, Norton (InQuizitive, Smartwork), WebAssign, McGraw-Hill Connect, Achieve, Cengage, zyBooks, Top Hat, Perusall, Packback, Hawkes, Vista Higher Learning, Sapling, Expert TA, Knewton Alta, PrairieLearn, Vocareum, GoReact | Read from the assignment page DueBoard opens through your Brightspace homework link (after you allow the platform once) |
| Any other platform Brightspace launches | Same as above: DueBoard asks to allow the site the first time it finds one |
| Syllabus (Simple Syllabus, PDF or web page in Content) | Shown as suggestions you can add or hide |
| Anything else | Add it by hand; it stays until you remove it |

A date from Brightspace always wins over one read on a platform page, and every platform date says where it was read ("Read from ALEKS").

## Install

- **Chrome Web Store:** link coming soon.
- **Firefox Add-ons:** link coming soon.
- **Manual install (about two minutes):** follow the [illustrated install guide](https://yokiwa.github.io/dueboard/install.html). The same steps are in [docs/guide/01-install.md](docs/guide/01-install.md).

DueBoard currently supports `purdue.brightspace.com`.

## Privacy

- Everything stays in your browser. Nothing is uploaded, collected or analyzed.
- DueBoard never sees your password; it only reuses sessions your browser already has, and only sends read requests.
- Platform pages are opened only through your own Brightspace links, only for platforms you allowed, and only read — DueBoard never clicks, types or submits. These pages appear in your browser history like pages you open yourself.
- Uninstalling removes all data.
- Details: [privacy policy](docs/privacy.html).

## Development

Requires Node.js 22.

```bash
npm install
```

```bash
npm run dev      # start Chrome with the extension in development mode
```

```bash
npm test         # run the test suite
```

```bash
npm run zip           # build the zip for the Chrome Web Store
```

```bash
npm run zip:firefox   # build the Firefox zip and the source zip for Firefox Add-ons
```

```bash
npm run e2e:visits    # end-to-end check of platform visits in Chromium (needs Playwright)
```

Design notes and the original implementation plan are in [`docs/superpowers/`](docs/superpowers/). Guides for installing, exporting sample pages, publishing and the beta are in [`docs/guide/`](docs/guide/).

## Feedback

Missing assignments, wrong dates or a homework platform DueBoard doesn't know yet? Please open an [issue](../../issues).

## License

[MIT](LICENSE)
