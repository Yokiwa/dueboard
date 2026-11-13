# Guide 01: Install DueBoard manually

Until DueBoard is on the Chrome Web Store, install it with Chrome's developer mode. It takes about two minutes.

A version of these steps with screenshots is on the website: [Install DueBoard](https://yokiwa.github.io/dueboard/install.html). Send that link to anyone who wants to try DueBoard.

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
- **Pearson MyLab** — read automatically. If the Pearson session expired, DueBoard reopens it through Brightspace by itself.
- **WileyPLUS, ALEKS, InQuizitive and other platforms** — the first time DueBoard finds one in your courses, a bar asks to allow it. After that, DueBoard attempts to read homework invisibly, without opening tabs or windows. Existing dates stay saved when a read fails. Sign in yourself if needed, then refresh. Some platforms may remain unavailable.

## Update to a new version

1. Unzip the new release and **replace** the files in the same folder.
2. Open `chrome://extensions` and click the reload (circular arrow) button on the DueBoard card.

## Firefox

DueBoard for Firefox is coming to Firefox Add-ons. Testers can follow [Guide 05](05-firefox.md).

## Common problems

- **"Manifest file is missing or unreadable":** you picked the wrong folder level. Choose the folder that directly contains `manifest.json`.
- **Chrome warns about developer-mode extensions on start-up:** normal for manually installed extensions; close the message. It goes away once DueBoard is installed from the Chrome Web Store.
