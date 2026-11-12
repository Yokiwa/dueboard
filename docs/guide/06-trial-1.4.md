# Guide 06: Trial of DueBoard 1.4.0 (background reading)

This is a test version. It is not on the Chrome Web Store or Firefox Add-ons yet. Version 1.4.0 reads your homework pages
in the background, without opening a window, and the point of this trial is to find out whether that works on the
platforms your courses really use. It takes about 15 minutes of your time, spread over a short wait.

You do not need to know anything about programming. If a step does not match what you see, stop and send a screenshot.

## What is different in this version

- DueBoard now reads homework due dates in a hidden page inside the extension. No window or tab should appear.
- If a page cannot be read that way, DueBoard falls back to a small minimized window, as older versions did.
- Reading happens automatically, not only when you click Refresh.
- The first-run page has one button, **Log in to Brightspace**.
- This test build does not include the scores feature.

## Before you start

- Use the computer and the browser where you normally do your coursework, signed in to the same accounts. A different account will not show the same platforms.
- If an older DueBoard is installed, remove it first (Chrome: `chrome://extensions`, **Remove**; Firefox: `about:addons`, **Remove**), so you start from a clean first run.

## Checklist

1. **Install the trial build.**
   - Chrome: unzip `dueboard-1.4.0-chrome.zip` into a folder you will keep. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the folder.
   - Firefox: unzip `dueboard-1.4.0-firefox.zip`, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and choose `manifest.json` in the folder. (Firefox forgets a temporary add-on when it closes, so do the whole trial in one sitting.)
   - Your browser lists the sites DueBoard may read when you install it. That is expected: it is the list of homework platform sites. Accept it.
2. **Sign in.** DueBoard's first-run page opens. Click **Log in to Brightspace**.
   - If you were already signed in to Brightspace, the first sync starts straight away.
   - If not, this tab goes to the Brightspace sign-in page. Sign in as usual. When Brightspace's home page loads, the tab comes back to DueBoard by itself and the sync starts.
   - Note anything that looks wrong (for example, the tab does not come back).
3. **Wait for the first sync.** Courses and Brightspace dates appear first. A line such as "Reading 3 of 22 platform pages…" shows while platform pages are read, and due dates fill in one by one. Leave the browser open for about 5 minutes, or until that line disappears.
   - Watch for any window that pops up or any new tab. A small minimized window that appears and closes is the fallback working. Note which homework was being read if you can.
4. **Open the visit log.** Click the gear icon (**Settings**), then **Diagnostics**. Scroll to **Platform visits**.
5. **Download the log.** Click **Download visit log**. A file called `dueboard-visit-log.json` is saved to your Downloads folder.
   - The log can include a short piece of page text, which may contain your name. Open the file in a text editor and check it before you send it.
6. **Send the file** to the developer, with the answers to the questions below.

## What to look for

In the Platform visits table, the **Mode** column shows how each page was read:

- **Background**: a hidden frame read the page. This is what we want.
- **Window**: the hidden frame could not read the page, so the minimized window did.

For each platform you use (WileyPLUS, ALEKS, Gradescope, Achieve, InQuizitive, and so on), look at its rows and note:

- Does the homework have a due date on the dashboard, marked "Read from …"?
- Is the Mode **Background** or **Window**? A platform that always shows **Window** is one we may need to fix or leave on the fallback.
- Does a row show no date at all? Then the **Opened → ended up on** column and the page text next to it help us see why.
- Did you see a sign-in page for a platform where you were signed in? Say which one.

Questions to answer in your message:

1. Which platforms do your courses use?
2. Did any window or tab appear? When, and for which platform?
3. Are all your homework due dates on the dashboard, and are they right?
4. Did the "Allow" banner appear? For which site? (It should only appear for a site DueBoard does not know.)
5. Anything else that looked wrong or slow?

## Turning the window fallback off

To see exactly what background reading can do alone, you can switch the window off:

1. Click the gear icon (**Settings**).
2. Under **Reading platforms**, clear the box **Use a small minimized window for pages that can't be read in the background**.
3. Press **Refresh** on the dashboard.

With the box cleared, no window ever opens. Pages that can only be read in a window stay without a date. Tick the box again
afterwards to go back to the normal behaviour.

To stop DueBoard reading platform pages altogether, set **Read homework pages from your platforms** to **Never**.

## When you are done

Nothing is sent anywhere unless you send the file yourself. To remove the trial build, remove it on `chrome://extensions`
(or `about:addons` in Firefox). Your data goes with it.
