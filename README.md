<p align="center"><img src="docs/assets/icon.svg" width="72" alt=""></p>

<h1 align="center">DueBoard</h1>

<p align="center">Every assignment, deadline and course platform from Brightspace — on one page.</p>

<p align="center"><img src="docs/assets/screenshot.png" width="760" alt="DueBoard course cards with a live countdown to the next deadline"></p>

> DueBoard is a student-built, open-source project and is **not affiliated with Purdue University, D2L Brightspace, Gradescope, Pearson or Wiley**.

## Why

At Purdue every course lives in Brightspace, but homework is spread across Gradescope, Pearson MyLab, WileyPLUS, Macmillan Achieve and more — each with its own login and its own list of due dates. DueBoard collects them so you can see what is due next without clicking through every course.

## What it does

- **One sign-in.** You only sign in to Brightspace. DueBoard reads your courses and discovers which homework platforms they use.
- **Course cards.** Upcoming work per course with countdowns, plus one-click shortcuts to each course's platforms.
- **Next deadline.** The nearest deadline sits on top with a live countdown, an *Open* button and a *Done* button.
- **Calendar and to-do views.** Week and month views; a to-do list you can tick off. Submitted work is ticked automatically where the platform reports it.
- **Automatic sync** every 30 minutes, using the sessions already in your browser.

### Where due dates come from

| Platform | How DueBoard gets the due date |
|---|---|
| Brightspace | Assignments, quizzes, calendar events and dated content items, read directly |
| Gradescope | Read from your Gradescope course pages when you are signed in |
| Pearson MyLab | Read from MyLab when a course links to Pearson; open it once from Brightspace if the session expired |
| WileyPLUS | Noted when you open an assignment page (each assignment needs to be opened once) |
| Achieve and other platforms | Shown when the platform puts its dates into Brightspace (most do) |
| Anything else | Add it by hand; it stays until you remove it |

## Install

- **Chrome Web Store:** link coming soon.
- **Manual install:** download the zip from [Releases](../../releases) and follow [docs/guide/01-install.md](docs/guide/01-install.md).

DueBoard currently supports `purdue.brightspace.com`.

## Privacy

- Everything stays in your browser. Nothing is uploaded, collected or analyzed.
- DueBoard never sees your password; it only reuses sessions your browser already has, and only sends read requests.
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
npm run zip      # build the zip for the Chrome Web Store
```

Design notes and the original implementation plan are in [`docs/superpowers/`](docs/superpowers/). Guides for installing, exporting sample pages, publishing and the beta are in [`docs/guide/`](docs/guide/).

## Feedback

Missing assignments, wrong dates or a homework platform DueBoard doesn't know yet? Please open an [issue](../../issues).

## License

[MIT](LICENSE)
