# Guide 04: Beta and launch checklist

Follows the timeline in the design document. Tick each step when done.

## Step 1 · Use it yourself for a week
- [ ] Install the latest release and keep it on for 7 days
- [ ] Every day, compare with Brightspace and each homework platform: anything missing? Wrong dates? Duplicates?
- [ ] Report problems with the course, the assignment name, what DueBoard showed and what is correct. Export a sample page if needed (Guide 02)

## Step 2 · Small beta (before finals)
- [ ] Create a feedback form (Google Forms is fine). Suggested questions:
  1. Which homework platforms do your courses use?
  2. Any missing or wrong assignments? Which course and assignment?
  3. Which view do you use most?
  4. What feature do you want most?
  5. Would you recommend DueBoard to a classmate? (1–5)
- [ ] Put the form link in `FEEDBACK_URL` (`src/ui/config.ts`) so it appears in Settings
- [ ] Publish on the Chrome Web Store as **Unlisted** (Guide 03, part 3)
- [ ] Invite 5–10 classmates from different majors (they use different platforms)
- [ ] Send each a one-line pitch plus the 30-second setup: install → sign in to Brightspace → click **Start sync**
- [ ] Follow up after a week: still using it? Why or why not?

## Step 3 · Prepare the launch (winter break)
- [ ] Fix beta issues; add the most-requested features and the most-used platforms from the form
- [ ] Assets:
  - [ ] a 30-second demo video or GIF: click the toolbar icon → open the dashboard → open the next deadline
  - [ ] three screenshots (`store/screenshots/`; re-capture if the UI changed)
  - [ ] a short description (the store listing works)
- [ ] Check the website at https://yokiwa.github.io/dueboard/
- [ ] Read Purdue IT's Acceptable Use Policy; if needed, email IT to explain what DueBoard does

## Step 4 · Launch (first week of the spring semester)
- [ ] Switch the store listing to **Public**
- [ ] Share it with a screenshot or GIF and one sentence on the problem it solves:
  - [ ] student group chats and clubs
  - [ ] course Discord / GroupMe servers (check the rules first)
  - [ ] Reddit r/Purdue (title example: *I made a free extension that shows all your Brightspace, Gradescope and Pearson deadlines on one page*)
- [ ] Always mention: free, open source, data stays on your computer, not an official Purdue product

## Step 5 · Keep it going
- [ ] Weekly: check users and ratings in the developer console
- [ ] Every two weeks: review feedback and pick the top one or two things
- [ ] Every release: write what changed in `CHANGELOG.md` and the GitHub release
