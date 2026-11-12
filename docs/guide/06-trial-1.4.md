# Guide 06: Trial of DueBoard 1.4 (background reading)

This is a test version. It is not on the Chrome Web Store or Firefox Add-ons yet. Version 1.4 reads your homework pages
in the background, without opening a window, and the point of this trial is to find out whether that works on the
platforms your courses really use. It takes about 15 minutes of your time, spread over a short wait.

You do not need to know anything about programming. If a step does not match what you see, stop and send a screenshot to the person who gave you this build.

## What is different in this version

- DueBoard now reads homework due dates in a hidden page inside the extension. Normally no window or tab appears.
- If a page cannot be read that way, DueBoard falls back to a small minimized window, as older versions did. A homework on a site DueBoard doesn't know yet is opened once in that small window to find out which site it is; DueBoard then asks you to allow that site.
- Reading happens automatically, not only when you click Refresh.
- The first-run page has one button, **Log in to Brightspace**.
- This test build does not include the scores feature.

## Before you start

- Use the computer and the browser where you normally do your coursework, signed in to the same accounts. A different account will not show the same platforms.
- If an older DueBoard is installed, turn it off with its toggle on the extensions page (Chrome: `chrome://extensions`; Firefox: `about:addons`). Do not remove it: turning it off keeps its data and avoids two copies running. Turn it back on after the trial if you go back to it.

## Updating from an earlier 1.4 trial

If an earlier 1.4 trial build is installed with **Load unpacked**, unzip `dueboard-1.4.3-chrome.zip` into the same folder,
replacing the files, then click the round arrow (reload) on DueBoard's card on `chrome://extensions`. Your courses and
settings stay, and DueBoard tries background reading again for every platform. Then continue from step 3 below
(click **Refresh** on the dashboard to start a sync).

## Checklist

1. **Install the trial build.**
   - Chrome: unzip the Chrome file you were given (`dueboard-1.4.3-chrome.zip`) into a folder you will keep. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the folder. Chrome shows no prompt for this (Load unpacked).
   - Firefox: unzip the Firefox file you were given (`dueboard-1.4.3-firefox.zip`), open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and choose `manifest.json` in the folder. (Firefox may show a prompt listing the sites the add-on can access; if it does, accept it. Firefox also forgets a temporary add-on when it closes, so do the whole trial in one sitting.)
2. **Sign in.** DueBoard's first-run page opens. Click **Log in to Brightspace**.
   - If you were already signed in to Brightspace, the first sync starts straight away.
   - If not, this tab goes to the Brightspace sign-in page. Sign in as usual. When Brightspace's home page loads, the tab comes back to DueBoard by itself and the sync starts.
   - Note anything that looks wrong (for example, the tab does not come back).
3. **Wait for the first sync.** Courses and Brightspace dates appear first. A line such as "Reading 3 of 22 platform pages…" shows while platform pages are read, and due dates fill in one by one. The first sync can take up to about 15 minutes, and the dashboard fills in as dates arrive. Leave the browser open until that line disappears.
   - Watch for any window that pops up or any new tab. A small minimized window that appears and closes is the fallback working. Note which homework was being read if you can.
4. **Open the visit log.** Click the gear icon (**Settings**), then **Diagnostics**. Scroll to **Platform visits**.
5. **Download the log.** Click **Download visit log**. A file called `dueboard-visit-log.json` is saved to your Downloads folder.
   - The log can include a short piece of page text, which may contain your name. Open the file in a text editor and check it before you send it.
6. **Send the file** to the person who gave you this build, with the answers to the questions below.

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
4. Did an "Allow" banner appear? For which site? (It should only appear for a site DueBoard does not know.)
5. Anything else that looked wrong or slow?

## If an "Allow" banner appears

A banner such as "DueBoard found <site> in your courses. Allow it to read their due dates?" appears only for a site DueBoard
does not know. If you recognize the site as one of your homework platforms, click **Allow**, and say in your message which
site it was. If you don't recognize it, click **Not now**.

## Turning the window fallback off

To see exactly what background reading can do alone, you can switch the window off:

1. Click the gear icon (**Settings**).
2. Under **Reading platforms**, clear the box **Use a small minimized window for pages that can't be read in the background**.
3. Press **Refresh** on the dashboard.

With the box cleared, no window opens. Pages that can only be read in a window stay without a date. Tick the box again
afterwards to go back to the normal behaviour.

To stop DueBoard reading platform pages altogether, set **Read homework pages from your platforms** to **Never**.

## When you are done

Nothing is sent anywhere unless you send the file yourself. To remove the trial build, remove it on `chrome://extensions`
(or `about:addons` in Firefox). Its data goes with it. If you turned your old DueBoard off, turn it back on there.
