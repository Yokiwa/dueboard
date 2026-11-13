// End-to-end check of platform visits in a real Chromium with the built extension (npm run e2e:visits).
// Brightspace and every platform are simulated with Playwright routes; nothing leaves the machine.
// Needs Playwright with a Chromium (preinstalled in the DueBoard cloud dev environment).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMocks } = require('./e2e/mock-sites.cjs');
const { BUILT, extensionCopy } = require('./e2e/extension.cjs');

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'; // route the service worker's own fetches too

const ROOT = path.resolve(__dirname, '..');
const fail = (msg) => {
  console.error(`e2e visits: FAILED — ${msg}`);
  process.exit(1);
};
const check = (ok, msg) => {
  if (!ok) fail(msg);
  console.log(`  ok  ${msg}`);
};

(async () => {
  if (!fs.existsSync(path.join(BUILT, 'manifest.json'))) fail('build first (npm run build)');
  const ext = extensionCopy();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dueboard-e2e-profile-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const mocks = createMocks();
  const hits = mocks.state.hits;
  const answer = (r) => {
    const req = r.request();
    return r.fulfill(mocks.respond({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() ?? '' }));
  };
  for (const host of ['purdue.brightspace.com', 'education.wiley.com', 'www.aleks.com', 'digital.wwnorton.com', 'example-unknown.com', 'www.gradescope.com'])
    await ctx.route(`https://${host}/**`, answer);

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/dashboard.html`);
  const windowsBefore = await page.evaluate(async () => (await chrome.windows.getAll()).length);

  // The sync answers once sources are read; visits go on until the visit window is gone and progress is cleared.
  const lastRun = () => page.evaluate(async () => (await chrome.storage.local.get('visitState')).visitState?.lastRun ?? null);
  const syncAndWait = async () => {
    const before = await lastRun();
    await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'manual' }));
    // A run records lastRun when it finishes; with nothing to visit there is no run, so stop waiting after 2 min.
    for (let waited = 0; waited < 120000 && (await lastRun()) === before; waited += 500) await page.waitForTimeout(500);
    // A Refresh that joined an automatic run gets its own pass afterwards: wait until no visit window for 3 s.
    const windowOpen = () => page.evaluate(async () => (await chrome.storage.session.get('visitWindowId')).visitWindowId != null);
    for (let quiet = 0, waited = 0; quiet < 3000 && waited < 120000; waited += 500) {
      quiet = (await windowOpen()) ? 0 : quiet + 500;
      await page.waitForTimeout(500);
    }
  };
  console.log('e2e visits: first sync (manual)');
  await syncAndWait();
  const s = await page.evaluate(() => chrome.storage.local.get(['captured', 'visitState', 'syllabus']));
  const expected = await page.evaluate(() => new Date(2026, 10, 20, 23, 59).toISOString()); // the browser's local time

  if (process.env.E2E_DEBUG) console.log(JSON.stringify(await page.evaluate(() => chrome.storage.local.get(['visitState', 'syncMeta', 'captured', 'visitProgress', 'settings']))));
  const hw7 = s.captured?.['brightspace:topic:1'];
  check(hw7?.dueAt === expected && hw7?.platform === 'aleks', `ALEKS homework read (${hw7?.dueAt}, ${hw7?.platform})`);
  const inq = s.captured?.["brightspace:topic:2"];
  check(inq?.dueAt === '2026-11-22T04:59:00.000Z' && inq?.platform === 'norton', `late-rendering InQuizitive page read (${inq?.dueAt})`);
  const hw11 = s.captured?.['brightspace:topic:5'];
  const hw10 = s.captured?.['brightspace:topic:6'];
  check(hw11?.dueAt === '2026-11-17T04:59:00.000Z' && hw11?.platform === 'wileyplus', `Wiley HW11 read after its launcher's "Open Assignment" button (${hw11?.dueAt})`);
  check(hw10?.dueAt === '2026-11-10T04:59:00.000Z', `Wiley HW10 read after its launcher's "Launch" link (${hw10?.dueAt})`);
  const vlog = await page.evaluate(async () => (await chrome.storage.local.get('visitLog')).visitLog ?? []);
  // Each page now has a frame entry first (the hidden frame could not read these mocks) and then its window entry.
  const windowLog = vlog.filter((e) => e.mode === 'window');
  if (process.env.E2E_DEBUG) console.log(JSON.stringify(vlog.map((e) => [e.key, e.mode, e.result, e.detail])));
  check(vlog.some((e) => e.key === 'brightspace:topic:6' && e.mode === 'frame') && windowLog.some((e) => e.key === 'brightspace:topic:6'), 'a page the hidden frame could not read was read in the window in the same run');
  check(!vlog.some((e) => e.key === 'brightspace:topic:5' && e.mode === 'frame') && windowLog.some((e) => e.key === 'brightspace:topic:5'), 'once a platform was blocked 3 times in the pass, its waiting page went straight to the window');
  const hw11Log = windowLog.find((e) => e.key === 'brightspace:topic:5');
  check(hw11Log?.siteNote?.startsWith('no launch target on') && !hw11Log.site, `visit log says why the site wasn't known (${hw11Log?.siteNote})`);
  check(windowLog.find((e) => e.key === 'brightspace:topic:6')?.clicked?.[0] === 'Launch (education.wiley.com)', 'HW10\'s "Launch" link (meant for a new tab) was followed in the hidden tab');
  check(hw11Log?.result === 'found' && hw11Log.clicked?.[0] === 'Open Assignment (education.wiley.com)', `HW11's launcher button was pressed (${hw11Log?.clicked})`);
  check(!JSON.stringify(vlog).includes('Start Over'.replace(' ', '')) && !(vlog.flatMap((e) => e.clicked ?? []).some((c) => /start/i.test(c))), 'never pressed a "Start" button');
  const gsMeta = await page.evaluate(async () => (await chrome.storage.local.get('syncMeta')).syncMeta?.gradescope);
  const gsCourses = await page.evaluate(async () => (await chrome.storage.local.get('snapshots')).snapshots?.gradescope?.courses?.length ?? 0);
  check(gsMeta?.lastSuccess && gsCourses > 0, `a homework link that landed on Gradescope signed in, and Gradescope was read again in the same run (${gsCourses} courses)`);
  const unk = s.captured?.['brightspace:topic:3'];
  check(unk?.blocked === 'example-unknown.com' && hits.unknown === 0, 'unknown site not visited; access asked instead');
  check(s.visitState?.needsPermission?.includes('example-unknown.com'), 'access request recorded for example-unknown.com');
  check(!s.captured?.['brightspace:topic:4'], 'run stopped at the sign-in page without recording a failure');
  const remembered = await page.evaluate(async () => (await chrome.storage.session.get('visitWindowId')).visitWindowId);
  check(remembered === null || remembered === undefined, 'no visit window remembered as open');
  const windowsAfter = await page.evaluate(async () => (await chrome.windows.getAll()).length);
  check(windowsAfter === windowsBefore, `visit window closed (${windowsBefore} → ${windowsAfter} windows)`);
  const rows = s.syllabus?.['102']?.rows ?? [];
  check(rows.some((r) => r.title === 'Project proposal due'), `syllabus PDF read in the offscreen page (${rows.map((r) => r.title).join(', ')})`);

  await page.reload();
  await page.getByRole('tab', { name: 'To-do' }).click();
  // The To-do line shows the course; where the date was read is its tooltip.
  await page.locator('[title^="Read from ALEKS"]').first().waitFor({ timeout: 10000 });
  check(true, 'the To-do says the date was "Read from ALEKS" (tooltip)');
  await page.getByText('DueBoard found example-unknown.com in your courses').waitFor({ timeout: 10000 });
  check(true, 'dashboard offers access for example-unknown.com');
  await page.getByRole('heading', { name: 'From syllabus' }).waitFor({ timeout: 10000 });
  check(true, 'syllabus suggestion listed under "From syllabus"');
  if (process.env.E2E_SCREENSHOT) await page.screenshot({ path: process.env.E2E_SCREENSHOT, fullPage: true });

  console.log('e2e visits: second sync within the hour (signed back in)');
  mocks.state.signedOut = false;
  const before = { ...hits };
  await syncAndWait();
  check(hits.aleks === before.aleks && hits.norton === before.norton, 'no platform page opened again');

  await ctx.close();
  fs.rmSync(ext, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('e2e visits: all checks passed');
})().catch((e) => fail(e.stack || String(e)));
