// End-to-end check of hidden frames in a real Chromium with the built extension (npm run e2e:frames).
// Playwright cannot route requests made by iframes of the offscreen document, so the platform pages come from a
// local HTTPS server; Chromium maps every hostname to it. Needs Playwright with a Chromium and openssl.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMocks, startServer } = require('./e2e/mock-sites.cjs');
const { BUILT, extensionCopy } = require('./e2e/extension.cjs');

const check = (ok, msg) => {
  if (!ok) throw new Error(msg); // the catch at the bottom cleans up, then exits 1
  console.log(`  ok  ${msg}`);
};
const brief = (r) => JSON.stringify({ status: r?.status, host: r?.host, landed: r?.landed, found: r?.found, clicked: r?.clicked, frames: r?.frames?.length });

(async () => {
  if (!fs.existsSync(path.join(BUILT, 'manifest.json'))) throw new Error('build first (npm run build)');
  const mocks = createMocks({ scenario: 'background' });
  // Installing runs an automatic sync. Signed out at first, so it stops at Brightspace and leaves the first run to the checks.
  mocks.state.signedOut = true;
  let server;
  let ext;
  let profile;
  let ctx;
  const cleanup = async () => {
    await ctx?.close().catch(() => {});
    await server?.close().catch(() => {});
    if (ext) fs.rmSync(ext, { recursive: true, force: true });
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  };
  try {
    server = await startServer(mocks);
    ext = extensionCopy();
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dueboard-e2e-profile-'));
    ctx = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${ext}`,
        `--load-extension=${ext}`,
        `--host-resolver-rules=MAP * 127.0.0.1:${server.port}`,
        '--ignore-certificate-errors',
        '--no-proxy-server', // dev containers set HTTPS_PROXY, which Chromium would use instead of the host mapping
      ],
    });
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const logs = [];
    sw.on('console', (m) => logs.push(`[sw] ${m.text()}`));
    ctx.on('console', (m) => logs.push(`[page] ${m.text()}`));
    const id = new URL(sw.url()).host;
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html`);
    // Record every tab and window created from here on, so one opened and closed in between cannot go unseen.
    await page.evaluate(() => {
      window.__created = [];
      chrome.tabs.onCreated.addListener((t) => window.__created.push(`tab ${t.id} ${t.url ?? ''}`));
      chrome.windows.onCreated.addListener((w) => window.__created.push(`window ${w.id}`));
    });

    const layout = () =>
      page.evaluate(async () => ({
        windows: (await chrome.windows.getAll()).length,
        tabs: (await chrome.tabs.query({})).map((t) => t.id).sort(),
      }));
    const probe = (token, url, headers, extra = { mode: 'due' }) =>
      page.evaluate(([t, u, h, x]) => chrome.runtime.sendMessage({ type: 'frameProbe', req: { token: t, url: u, ...x }, headers: h }), [token, url, headers, extra]);
    async function fullSyncChecks() {
      // ---- Full syncs through the dashboard. The service worker's API calls and the hidden frames reach the local
      // server; tabs (the dashboard, the visit window) are answered by routes from the same respond().
      const answer = (r) => {
        const req = r.request();
        return r.fulfill(mocks.respond({ url: req.url(), method: req.method(), headers: req.headers() }, 'route'));
      };
      for (const host of ['purdue.brightspace.com', 'education.wiley.com', 'www.aleks.com', 'digital.wwnorton.com', 'example-unknown.com', 'example-unknown2.com', 'www.gradescope.com'])
        await ctx.route(`https://${host}/**`, answer);

      const local = (keys) => page.evaluate((k) => chrome.storage.local.get(k), keys);
      const captured = async () => (await local('captured')).captured ?? {};
      const visitLog = async () => (await local('visitLog')).visitLog ?? [];
      const noWindow = () => page.evaluate(async () => (await chrome.storage.session.get('visitWindowId')).visitWindowId == null);
      const progressNull = async () => (await local('visitProgress')).visitProgress == null;
      const watchCreated = () =>
        page.evaluate(() => {
          window.__created = []; // listeners are added once per page load; later calls only empty the list
          if (window.__watching) return;
          window.__watching = true;
          chrome.tabs.onCreated.addListener((t) => window.__created.push(`tab ${t.id}`));
          chrome.windows.onCreated.addListener((w) => window.__created.push(`window ${w.id}`));
        });
      const created = () => page.evaluate(() => window.__created);
      /** Waits for `done()`, then until the run is over: no progress line and no visit window for 3 s. */
      const settle = async (done, what) => {
        let waited = 0;
        while (!(await done())) {
          if ((waited += 500) > 150000) {
            const tail = (await visitLog()).slice(-8).map((e) => `${e.key} ${e.mode} ${e.result}${e.detail ? `:${e.detail}` : ''} ${e.landed ?? ''}`);
            throw new Error(`timed out waiting for ${what}; last visits:\n    ${tail.join('\n    ')}`);
          }
          await page.waitForTimeout(500);
        }
        for (let quiet = 0; quiet < 3000; ) {
          quiet = (await noWindow()) && (await progressNull()) ? quiet + 500 : 0;
          await page.waitForTimeout(500);
        }
      };
      const local20 = (d) => page.evaluate((x) => new Date(2026, 10, x[0], 23, 59).toISOString(), [d]);

      console.log('e2e frames: first run, "Log in to Brightspace" while signed in starts the sync (no window, no tab)');
      for (let waited = 0; waited < 30000; waited += 500) {
        if ((await local('syncMeta')).syncMeta?.brightspace?.lastError) break; // the install-time sync has ended
        await page.waitForTimeout(500);
      }
      mocks.state.signedOut = false;
      await page.reload();
      await watchCreated();
      const framedBefore = mocks.state.hits.framed;
      await page.getByRole('button', { name: 'Log in to Brightspace' }).click();
      await settle(async () => {
        const c = await captured();
        return ['21', '23', '24', '25', '29', '30', '32', '33'].every((n) => c[`brightspace:topic:${n}`]?.dueAt);
      }, 'the first automatic sync to date the homeworks');
      let c = await captured();
      check(c['brightspace:topic:21'].dueAt === (await local20(20)), `a page that refuses framing was dated in the sync (${c['brightspace:topic:21'].dueAt})`);
      check(mocks.state.hits.framed > framedBefore, `its page came from the hidden frame server during this sync (${framedBefore} -> ${mocks.state.hits.framed} hits)`);
      check((await created()).length === 0, `no window or tab opened during the automatic sync (${(await created()).join('; ') || 'none'})`);
      check(c['brightspace:topic:29'].dueAt === (await local20(24)), `a page Brightspace shows inside its own launch page was dated in the background (${c['brightspace:topic:29'].dueAt})`);
      check(c['brightspace:topic:30'].dueAt === '2026-11-24T04:59:00.000Z', `a launcher with its own window.open and an empty new window opened the assignment in the frame (${c['brightspace:topic:30'].dueAt})`);
      check(c['brightspace:topic:32'].dueAt === (await local20(25)), `a tool Brightspace opens "in a new window" was read in the frame (${c['brightspace:topic:32'].dueAt})`);
      check(c['brightspace:topic:33'].dueAt === (await local20(26)), `a link the launch page's script clicked without adding it to the page opened in the frame (${c['brightspace:topic:33'].dueAt})`);
      check(mocks.state.hits.nodate > 0 && !c['brightspace:topic:31']?.dueAt, `an embedded page without a date was read and left undated (${mocks.state.hits.nodate} hits)`);
      let log = await visitLog();
      check(log.length > 0 && log.every((e) => e.mode === 'frame'), `every visit ran in the background (${log.map((e) => e.mode).join(',')})`);
      const e3 = log.find((e) => e.key === 'brightspace:topic:31');
      check(e3?.result === 'none' && e3?.landed?.includes('/nodate/'), `the page without a date ended "none" on the embedded page, not "failed" (${e3?.result}, ${e3?.landed})`);
      const ps = [23, 24, 25].map((n) => c[`brightspace:topic:${n}`]);
      check(ps[0].dueAt === '2026-11-22T04:59:00.000Z' && ps[1].dueAt === '2026-11-29T04:59:00.000Z' && ps[2].dueAt === '2026-12-06T04:59:00.000Z', `a list page dated three homeworks (${ps.map((x) => x.dueAt).join(', ')})`);
      const psLog = log.filter((e) => [23, 24, 25].some((n) => e.key === `brightspace:topic:${n}`));
      const psVisits = psLog.filter((e) => e.detail !== 'listed');
      check(psVisits.length === 1 && psLog.length === 3, `one frame visit served all three (${psVisits.length} visit, ${psLog.length} entries)`);

      // A homework on a site that is not a known platform: DueBoard opens the minimized window once to learn the site
      // (the 1.2.4 behavior), never reads it, and asks for access.
      await watchCreated();
      const unknownWindowsBefore = (await layout()).windows;
      mocks.state.unknownSite = true;
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'auto' }));
      await settle(async () => ((await local('visitState')).visitState?.needsPermission ?? []).includes('example-unknown.com'), 'the unknown site to be noted');
      const learned = await created();
      check(learned.filter((x) => x.startsWith('window')).length === 1, `learning the unknown site opened exactly one window (${learned.join('; ')})`);
      check((await layout()).windows === unknownWindowsBefore && (await noWindow()), 'that window closed afterwards');
      // The banner for an unknown site, and none for a registry platform (ALEKS and Norton are granted at install).
      await page.reload();
      await page.getByRole('tab', { name: 'To-do' }).click();
      await page.getByText('DueBoard found example-unknown.com in your courses').waitFor({ timeout: 10000 });
      check((await page.getByRole('button', { name: 'Allow', exact: true }).count()) === 1, 'one "Allow" banner, for the unknown site');
      const banner = await page.getByText(/DueBoard found .* in your courses/).allTextContents();
      check(banner.length === 1 && !/aleks|norton|wwnorton|wiley|gradescope|pearson/i.test(banner[0]), `no "Allow" banner for a registry platform (the only banner: ${banner[0]})`);
      check(!(await captured())['brightspace:topic:26']?.dueAt, 'no date was taken from the unknown site');

      console.log('e2e frames: a page the frames cannot read goes to the minimized window in the same run');
      await watchCreated();
      const windowsBefore = (await layout()).windows;
      mocks.state.frameless = true;
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'auto' }));
      await settle(async () => !!(await captured())['brightspace:topic:22']?.dueAt, 'the windowed homework to be dated');
      c = await captured();
      check(c['brightspace:topic:22'].dueAt === (await local20(19)), `dated in the window (${c['brightspace:topic:22'].dueAt})`);
      const made = await created();
      check(made.filter((x) => x.startsWith('window')).length === 1, `one window was opened (${made.join('; ')})`);
      check((await layout()).windows === windowsBefore && (await noWindow()), 'the window closed afterwards');
      log = await visitLog();
      const mine = log.filter((e) => e.key === 'brightspace:topic:22');
      check(mine.some((e) => e.mode === 'frame') && mine.some((e) => e.mode === 'window' && e.result === 'found'), `the log has a Background entry and a Window entry for it (${mine.map((e) => `${e.mode}:${e.result}`).join(', ')})`);
      await page.goto(`chrome-extension://${id}/diagnostics.html`);
      await page.getByRole('heading', { name: 'Platform visits' }).waitFor({ timeout: 10000 });
      check((await page.getByRole('cell', { name: 'Background', exact: true }).count()) > 0 && (await page.getByRole('cell', { name: 'Window', exact: true }).count()) > 0, 'Diagnostics shows both "Background" and "Window" in the Mode column');
      await page.goto(`chrome-extension://${id}/dashboard.html`);

      console.log('e2e frames: window fallback turned off');
      await page.evaluate(async () => {
        const { settings } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, windowFallback: false } });
      });
      await watchCreated();
      mocks.state.frameless2 = true;
    mocks.state.unknownSite2 = true; // a second unknown site, learned only through the window
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'auto' }));
      await settle(async () => (await visitLog()).some((e) => e.key === 'brightspace:topic:27') && (await visitLog()).some((e) => e.key === 'brightspace:topic:28'), 'the visits of the second windowed homework and the second unknown site');
      check((await created()).length === 0, `no window and no tab opened, also for an unknown site (${(await created()).join('; ') || 'none'})`);
      check(!(await captured())['brightspace:topic:27']?.dueAt, 'the item the frames cannot read stays undated');
      await page.evaluate(async () => {
        const { settings } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, windowFallback: true } });
      });

      console.log('e2e frames: first run while signed out');
      await page.evaluate(async () => {
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
      });
      mocks.state.signedOut = true;
      await page.goto(`chrome-extension://${id}/dashboard.html`);
      await page.getByRole('button', { name: 'Log in to Brightspace' }).click();
      await page.waitForURL(/purdue\.brightspace\.com\/d2l\/login/, { timeout: 15000 });
      check(true, `the tab went to Brightspace's sign-in page (${page.url()})`);
      mocks.state.signedOut = false; // the student signs in
      await page.goto('https://purdue.brightspace.com/d2l/home');
      await page.waitForURL(/chrome-extension:\/\/.*\/dashboard\.html/, { timeout: 15000 });
      check(true, `the tab came back to the dashboard (${page.url()})`);
      await settle(async () => !!(await captured())['brightspace:topic:21']?.dueAt, 'the sync after signing in');
      check(!!(await captured())['brightspace:topic:21']?.dueAt, 'the sync started by itself and dated a homework');
      check(!page.url().includes('start='), 'the address no longer carries ?start=1');
    }
    const target = 'https://www.aleks.com/framed/hw7';
    const before = await layout();

    console.log('e2e frames: page that refuses framing, header rule on');
    const hitsBefore = mocks.state.hits.framed;
    const found = await probe('t1', target, true);
    console.log(`  FrameResult: ${brief(found)}`);
    const expected = await page.evaluate(() => new Date(2026, 10, 20, 23, 59).toISOString());
    check(mocks.state.hits.framed > hitsBefore, 'the hidden frame reached the local server');
    check(found?.frames?.length >= 1, `the result lists the frame (${found?.frames?.length})`);
    check(found?.status === 'found' && found.found?.dueAt === expected, `page that refuses framing was read (${found?.found?.title}, ${found?.found?.dueAt})`);

    console.log('e2e frames: same visit without begin()');
    const hitsMid = mocks.state.hits.framed;
    const blocked = await probe('t2', target, false);
    console.log(`  FrameResult: ${brief(blocked)}`);
    check(mocks.state.hits.framed > hitsMid, 'the server was reached again, so blocked comes from the refused frame and not the network');
    check(blocked?.status === 'blocked', `without the header rule the visit ends blocked (${blocked?.status})`);

    console.log('e2e frames: Pearson sign-in through its Brightspace page');
    const mylabBefore = mocks.state.hits.mylab;
    const pearson = await probe('t3', 'https://purdue.brightspace.com/d2l/common/dialogs/quickLink/quickLink.d2l?ou=103&type=lti&rcode=S1', true, { mode: 'session', platform: 'pearson' });
    console.log(`  FrameResult: ${brief(pearson)}`);
    check(pearson?.clicked?.some((c) => c.startsWith('Assignments')), `the Assignments link was pressed (${pearson?.clicked?.join('; ')})`);
    check(mocks.state.hits.mylab > mylabBefore && pearson?.status === 'landed' && pearson?.host === 'mylab.pearson.com', `the visit ended on MyLab, in the frame (${pearson?.status}, ${pearson?.host})`);

    console.log('e2e frames: a page that opens a tab in a way no page script catches');
    const escape = await probe('t4', 'https://purdue.brightspace.com/d2l/common/dialogs/quickLink/quickLink.d2l?ou=103&type=lti&rcode=E6', true);
    console.log(`  FrameResult: ${brief(escape)}`);
    await page.waitForTimeout(1500);
    check(escape?.status === 'blocked', `the visit ends blocked, for the minimized window to read (${escape?.status})`);

    const after = await layout();
    const created = await page.evaluate(() => window.__created);
    check(created.length === 0, `no tab or window was created during the run (${created.join('; ') || 'none'})`);
    check(JSON.stringify(after) === JSON.stringify(before), `windows and tabs are the same (${before.windows} windows, ${before.tabs.length} tabs, before and after)`);
    await fullSyncChecks();
    if (process.env.E2E_DEBUG) console.log(logs.join('\n'));
    await cleanup();
    console.log('e2e frames: all checks passed');
  } catch (e) {
    if (process.env.E2E_DEBUG) console.error(logs.join('\n'));
    await cleanup();
    console.error(`e2e frames: FAILED — ${e.stack || e}`);
    process.exit(1);
  }
})();
