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
  const logs = [];
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
    sw.on('console', (m) => logs.push(`[sw] ${m.text()}`));
    ctx.on('console', (m) => logs.push(`[page] ${m.text()}`));
    const id = new URL(sw.url()).host;
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html`);
    const dashboardTabId = await page.evaluate(async () => (await chrome.tabs.getCurrent()).id);
    // Record every tab and window created from here on, so one opened and closed in between cannot go unseen.
    await page.evaluate(() => {
      window.__created = [];
      chrome.tabs.onCreated.addListener((t) => window.__created.push(`tab ${t.id} ${t.url ?? ''}`));
      chrome.windows.onCreated.addListener((w) => self.__created.push(`window ${w.id}`));
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
        return r.fulfill(mocks.respond({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() ?? '' }, 'route'));
      };
      for (const host of ['purdue.brightspace.com', 'education.wiley.com', 'www.aleks.com', 'digital.wwnorton.com', 'example-unknown.com', 'example-unknown2.com', 'www.gradescope.com', 'interop.pearson.com', 'socket.pearsoned.com', 'console.pearson.com', 'mylab.pearson.com'])
        await ctx.route(`https://${host}/**`, answer);

      const local = (keys) => sw.evaluate((k) => chrome.storage.local.get(k), keys);
      const captured = async () => (await local('captured')).captured ?? {};
      const visitLog = async () => (await local('visitLog')).visitLog ?? [];
      const noWindow = () => sw.evaluate(async () => (await chrome.storage.session.get('visitWindowId')).visitWindowId == null);
      const progressNull = async () => (await local('visitProgress')).visitProgress == null;
      const watchCreated = () =>
        sw.evaluate((tabId) => {
          self.__watchedTab = tabId;
          self.__navigation = [];
          self.__created = []; // listeners are added once per page load; later calls only empty the list
          if (self.__watching) return;
          self.__watching = true;
          chrome.tabs.onCreated.addListener((t) => self.__created.push(`tab ${t.id}`));
          chrome.windows.onCreated.addListener((w) => self.__created.push(`window ${w.id}`));
          chrome.tabs.onUpdated.addListener((id, info) => { if (id === self.__watchedTab && info.url) self.__navigation.push(info.url.split(/[?#]/)[0]); });
        }, dashboardTabId);
      const created = () => sw.evaluate(() => self.__created);
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
      mocks.state.pearson = true;
      mocks.state.pearsonWorkerExpired = true;
      mocks.state.mylabSignedIn = false;
      await page.reload();
      await watchCreated();
      const framedBefore = mocks.state.hits.framed;
      await page.getByRole('button', { name: 'Log in to Brightspace' }).click();
      await settle(async () => {
        const c = await captured();
        return ['21', '23', '24', '25', '29', '30', '32', '33'].every((n) => c[`brightspace:topic:${n}`]?.dueAt) && (await local('snapshots')).snapshots?.pearson?.items?.length === 42;
      }, 'the first automatic sync to date the homeworks');
      check((await sw.evaluate(() => self.__navigation)).length === 0, 'the dashboard never navigated during the entire first sync');
      check(mocks.state.hits.socket > 0, 'Pearson authentication passed through socket.pearsoned.com');
      check(mocks.state.hits.gatewayClick > 0, 'Open Pearson was followed inside the hidden reader before Assignments');
      let c = await captured();
      check(c['brightspace:topic:21'].dueAt === (await local20(20)), `a page that refuses framing was dated in the sync (${c['brightspace:topic:21'].dueAt})`);
      check(mocks.state.hits.framed > framedBefore, `its page came from the hidden frame server during this sync (${framedBefore} -> ${mocks.state.hits.framed} hits)`);
      check((await created()).length === 0, `no window or tab opened during the automatic sync (${(await created()).join('; ') || 'none'})`);
      check(c['brightspace:topic:29'].dueAt === (await local20(24)), `a page Brightspace shows inside its own launch page was dated in the background (${c['brightspace:topic:29'].dueAt})`);
      check(c['brightspace:topic:30'].dueAt === '2026-11-24T04:59:00.000Z', `a launcher with its own window.open and an empty new window opened the assignment in the frame (${c['brightspace:topic:30'].dueAt})`);
      const scoredWiley = (await local('completion')).completion?.['brightspace:topic:30'];
      check(scoredWiley?.state === 'done' && scoredWiley?.score?.earned === 18, 'Wiley homework kept its gradebook score and still received a due date');
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

      const math = (await local('snapshots')).snapshots.pearson.items;
      check(math.length === 42 && math.every((item) => item.dueAt), 'all 42 math assignments have dates after the first Brightspace login click');
      check((await created()).length === 0, 'Pearson first sync created no tabs or windows');
      check(!JSON.stringify(await visitLog()).includes('sessionHtml'), 'transient session HTML is absent from diagnostics');
      mocks.state.pearsonWorkerExpired = false;

      console.log('e2e frames: blocked platforms and expired sessions never open tabs or windows');
      await watchCreated();
      const windowsBefore = (await layout()).windows;
      mocks.state.frameless = true;
      mocks.state.pearson = true;
      mocks.state.pearsonFrameBroken = true;
      mocks.state.mylabSignedIn = false;
      // Stored opt-ins from older versions must not resurrect window visits.
      await page.evaluate(async () => {
        const { settings } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, windowFallback: true } });
      });
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'auto' }));
      await settle(async () => {
        const entries = await visitLog();
        return entries.some((e) => e.key === 'brightspace:topic:22') && entries.some((e) => e.key === 'pearson:session');
      }, 'blocked homework and expired Pearson session to finish in the background');
      check((await created()).length === 0, 'neither a tab nor a window opened for blocked pages or expired sessions');
      check((await layout()).windows === windowsBefore && (await noWindow()), 'browser windows stayed unchanged');
      check(!(await captured())['brightspace:topic:22']?.dueAt, 'an unreadable page stays undated rather than fabricating a date');
      log = await visitLog();
      check(log.every((e) => e.mode === 'frame'), 'every platform visit stayed in hidden frames');
      check((await sw.evaluate(() => self.__navigation)).length === 0, 'a failed Pearson renewal did not navigate the dashboard');
      check((await local('snapshots')).snapshots?.pearson?.items?.length === 42, 'a failed renewal preserved previously read math assignments');
      mocks.state.pearson = false;

      console.log('e2e frames: 1.5.0, whether past-due work was handed in, its score, "Not sure" and Overdue');
      mocks.state.completion = true;
      mocks.state.gradescopeSignedIn = true;
      mocks.state.pearson = true;
      mocks.state.mylabSignedIn = true;
      const completion = async () => (await local('completion')).completion ?? {};
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'auto' }));
      await settle(async () => {
        const k = await completion();
        return !!(k['brightspace:topic:34'] && k['brightspace:topic:35'] && k['brightspace:dropbox:502']);
      }, 'the completion of the past-due work to be read');
      let k = await completion();
      check(k['brightspace:dropbox:501']?.state === 'done' && k['brightspace:dropbox:501'].by === 'submitted', `a folder with a submission is done (${JSON.stringify(k['brightspace:dropbox:501'])})`);
      check(k['brightspace:dropbox:502']?.state === 'not_done', `a past-due folder without one is not done (${JSON.stringify(k['brightspace:dropbox:502'])})`);
      check(k['brightspace:quiz:601']?.state === 'done' && k['brightspace:quiz:601'].score?.earned === 9, `a quiz with a gradebook score is done with it (${JSON.stringify(k['brightspace:quiz:601'])})`);
      check(k['brightspace:topic:34']?.state === 'done' && k['brightspace:topic:34'].score?.earned === 18 && k['brightspace:topic:34'].score?.possible === 25, `a platform page showing "Score: 18/25" made its homework done (${JSON.stringify(k['brightspace:topic:34'])})`);
      check(k['brightspace:topic:35']?.state === 'unknown' && k['brightspace:topic:35'].tries === 1, `a page that says nothing is one try with no answer (${JSON.stringify(k['brightspace:topic:35'])})`);
      check(Object.entries(k).some(([key, r]) => key.startsWith('gradescope:') && r.state === 'not_done'), 'a Gradescope "No Submission" row is not done');
      check(Object.entries(k).some(([key, r]) => key.startsWith('pearson:') && r.state === 'done' && r.score?.text === '92%'), `a Pearson score from its "see score" callback made that row done (${JSON.stringify(Object.entries(k).filter(([key]) => key.startsWith('pearson:')).map(([, r]) => r.score?.text ?? r.state))})`);
      log = await visitLog();
      const c34 = log.find((e) => e.key === 'brightspace:topic:34');
      check(c34?.mode === 'frame' && c34.result === 'checked' && c34.answer === 'done (score 18/25)' && c34.evidence?.includes('18/25'), `the check ran in the background and the log shows its answer (${JSON.stringify({ mode: c34?.mode, result: c34?.result, answer: c34?.answer, evidence: c34?.evidence })})`);
      const c35 = log.find((e) => e.key === 'brightspace:topic:35');
      check(c35?.mode === 'frame' && c35.result === 'checked' && c35.answer === 'no answer', `the page that says nothing was read in the background, no window (${c35?.mode}, ${c35?.answer})`);

      await page.reload();
      await page.getByRole('tab', { name: 'To-do' }).click();
      const overdue = page.getByRole('region', { name: 'Overdue' });
      await overdue.waitFor({ timeout: 10000 });
      const showAll = overdue.getByRole('button', { name: /^Show all \d+ overdue$/ });
      check((await showAll.count()) === 1 && (await overdue.getByRole('listitem').count()) === 3, `Overdue shows 3 and "${await showAll.textContent().catch(() => '')}"`);
      const row = (title) => overdue.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: title, exact: true }) });
      check((await row('Blank Homework').count()) === 0, 'the homework whose page said nothing is not in Overdue');
      const notSure = page.locator('details').filter({ has: page.getByText(/^Not sure if handed in \(\d+\)$/) });
      await notSure.locator('summary').click();
      check((await notSure.getByRole('checkbox', { name: 'Blank Homework', exact: true }).count()) === 1, `it is under "${await notSure.locator('summary').textContent()}"`);
      await showAll.click();
      check((await overdue.getByRole('button', { name: 'Show fewer' }).count()) === 1, '"Show fewer" after showing all');
      for (const title of ['Essay 2', 'Essay 3', 'Essay 4']) check((await row(title).count()) === 1, `${title}, not handed in, is in Overdue`);
      for (const title of ['Essay 1', 'Scored Homework', 'Quiz 4']) check((await row(title).count()) === 0, `${title}, done, is not in Overdue`);
      await page.getByText(/^Completed \(\d+\)$/).click();
      const doneRow = (title) => page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: title, exact: true }) });
      check(((await doneRow('Scored Homework').textContent()) ?? '').includes('18/25'), 'the scored homework shows its score');
      check(((await doneRow('Quiz 4').textContent()) ?? '').includes('9/10'), 'the quiz shows its gradebook score');

      console.log('e2e frames: un-ticking automatic done work keeps it not done after the next sync');
      // The box shows what is stored, so it changes once the store has the student's choice.
      await doneRow('Essay 1').getByRole('checkbox').click();
      for (let waited = 0; waited < 5000 && !(await local('userState')).userState?.notDone?.['brightspace:dropbox:501']; waited += 250) await page.waitForTimeout(250);
      check((await local('userState')).userState?.notDone?.['brightspace:dropbox:501'] === true, 'un-ticking recorded "not done" for it');
      const lastBefore = (await local('syncMeta')).syncMeta?.brightspace?.lastSuccess;
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync', trigger: 'auto' }));
      await settle(async () => (await local('syncMeta')).syncMeta?.brightspace?.lastSuccess !== lastBefore, 'the next sync');
      await page.reload();
      await page.getByRole('tab', { name: 'To-do' }).click();
      await overdue.waitFor({ timeout: 10000 });
      const more = overdue.getByRole('button', { name: /^Show all \d+ overdue$/ });
      if (await more.count()) await more.click();
      check((await row('Essay 1').count()) === 1 && !(await row('Essay 1').getByRole('checkbox').isChecked()), 'Essay 1 is overdue and unticked after the sync, though Brightspace still shows its submission');
      mocks.state.completion = false;
      mocks.state.gradescopeSignedIn = false;
      mocks.state.pearson = false;

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
    if (process.env.E2E_SYNC_ONLY) {
      await sw.evaluate(() => {
        self.__senders = [];
        chrome.runtime.onMessage.addListener((message, sender) => {
          if (['sync', 'beginLogin', 'syncIfStale'].includes(message?.type)) self.__senders.push({ type: message.type, id: sender.tab?.id, url: sender.url?.split(/[?#]/)[0] });
        });
      });
      await fullSyncChecks();
      await cleanup();
      console.log('e2e sync: all checks passed');
      return;
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
    check(escape?.status === 'blocked', `the visit ends blocked without a visible fallback (${escape?.status})`);

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
