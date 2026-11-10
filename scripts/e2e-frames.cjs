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
  const mocks = createMocks();
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
    const probe = (token, url, headers) =>
      page.evaluate(([t, u, h]) => chrome.runtime.sendMessage({ type: 'frameProbe', req: { token: t, url: u, mode: 'due' }, headers: h }), [token, url, headers]);
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

    const after = await layout();
    const created = await page.evaluate(() => window.__created);
    check(created.length === 0, `no tab or window was created during the run (${created.join('; ') || 'none'})`);
    check(JSON.stringify(after) === JSON.stringify(before), `windows and tabs are the same (${before.windows} windows, ${before.tabs.length} tabs, before and after)`);
    if (process.env.E2E_DEBUG) console.log(logs.join('\n'));
    await cleanup();
    console.log('e2e frames: all checks passed');
  } catch (e) {
    await cleanup();
    console.error(`e2e frames: FAILED — ${e.stack || e}`);
    process.exit(1);
  }
})();
