# Guide 01: Install DueBoard manually

Until DueBoard is on the Chrome Web Store, install it with Chrome's developer mode. It takes about two minutes.

## First install

1. Download `dueboard-x.y.z-chrome.zip` from the [latest release](https://github.com/Yokiwa/dueboard/releases/latest).
2. Unzip it:
   - **Mac:** double-click the zip.
   - **Windows:** right-click the zip → **Extract All** → **Extract**.

   The folder you get should contain `manifest.json` directly. Move it somewhere permanent (for example a `DueBoard` folder in Documents) — Chrome runs the extension from this folder, so don't delete or move it later.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** (top left) and choose the folder from step 2 (the one that contains `manifest.json`).
6. **DueBoard** appears in the list. The dashboard opens with a welcome guide.
7. Click the puzzle-piece icon in Chrome's toolbar and pin DueBoard so its icon is always visible.

## Daily use

Click the DueBoard icon to see the next deadline and upcoming work; click **Open full dashboard** for everything.

The only account DueBoard needs is Brightspace. It finds your homework platforms from your courses:

- **Gradescope** — read automatically while you are signed in to Gradescope.
- **Pearson MyLab** — read automatically. If DueBoard says the Pearson session expired, open Pearson once from your course in Brightspace.
- **WileyPLUS** — open an assignment page once and DueBoard notes its due date.

## Update to a new version

1. Unzip the new release and **replace** the files in the same folder.
2. Open `chrome://extensions` and click the reload (circular arrow) button on the DueBoard card.

## Common problems

- **"Manifest file is missing or unreadable":** you picked the wrong folder level. Choose the folder that directly contains `manifest.json`.
- **Chrome warns about developer-mode extensions on start-up:** normal for manually installed extensions; close the message. It goes away once DueBoard is installed from the Chrome Web Store.
