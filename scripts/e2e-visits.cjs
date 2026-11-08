// End-to-end check of platform visits in a real Chromium with the built extension (npm run e2e:visits).
// Brightspace and every platform are simulated with Playwright routes; nothing leaves the machine.
// Needs Playwright with a Chromium (preinstalled in the DueBoard cloud dev environment).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'; // route the service worker's own fetches too

const ROOT = path.resolve(__dirname, '..');
const BUILT = path.join(ROOT, '.output/chrome-mv3');
const B = 'https://purdue.brightspace.com';
const LE = `${B}/d2l/api/le/1.80`;
const ql = (r) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rcode=${r}`;
const fail = (msg) => {
  console.error(`e2e visits: FAILED — ${msg}`);
  process.exit(1);
};
const check = (ok, msg) => {
  if (!ok) fail(msg);
  console.log(`  ok  ${msg}`);
};

/** A copy of the build where ALEKS and Norton are already allowed (a browser grants optional access only on a click). */
function extensionCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dueboard-e2e-'));
  fs.cpSync(BUILT, dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions.push('https://*.aleks.com/*', 'https://*.wwnorton.com/*', 'https://*.wiley.com/*', 'https://*.wileyplus.com/*');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  return dir;
}

const toc = {
  Modules: [
    {
      Title: 'Homework',
      Modules: [],
      Topics: [
        { TopicId: 1, Title: 'Homework 7', Url: ql('A1'), TypeIdentifier: 'Link' },
        { TopicId: 2, Title: 'InQuizitive Ch 5', Url: ql('N1'), TypeIdentifier: 'Link' },
        { TopicId: 3, Title: 'Assignment 3', Url: ql('U1'), TypeIdentifier: 'Link' },
        { TopicId: 4, Title: 'Worksheet 9', Url: ql('L1'), TypeIdentifier: 'Link' },
      ],
    },
    {
      // Like PHYS 172: several Wiley homeworks share one quick link (W1) that only reaches the Wiley course page;
      // each content page embeds its own assignment.
      Title: 'HOMEWORK 11',
      Modules: [],
      Topics: [
        { TopicId: 5, Title: 'PHYS 172H - HW11 - FA26', Url: ql('W1'), TypeIdentifier: 'Link' },
        { TopicId: 6, Title: 'PHYS 172H - HW10 - FA26', Url: ql('W1'), TypeIdentifier: 'Link' },
      ],
    },
    { Title: 'Start Here', Modules: [], Topics: [{ TopicId: 9, Title: 'Course Syllabus', Url: '/content/enforced/102-MA/syllabus.pdf', TypeIdentifier: 'File' }] },
  ],
};
const launchPage = (target) =>
  `<html><body><form id="f" action="${target}" method="get"></form><script>document.getElementById('f').submit()</script></body></html>`;

(async () => {
  if (!fs.existsSync(path.join(BUILT, 'manifest.json'))) fail('build first (npm run build)');
  const ext = extensionCopy();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dueboard-e2e-profile-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const hits = { aleks: 0, norton: 0, unknown: 0 };
  let signedOut = false; // the session expires when the Worksheet 9 link is opened
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const html = (body) => ({ status: 200, contentType: 'text/html', body });

  await ctx.route(`${B}/**`, (r) => {
    const u = r.request().url();
    if (u.includes('/users/whoami')) return signedOut ? r.fulfill({ status: 401, body: '' }) : r.fulfill(json({ Identifier: '1', FirstName: 'Test' }));
    if (u.endsWith('/d2l/api/versions/')) return r.fulfill(json([{ ProductCode: 'lp', LatestVersion: '1.47' }, { ProductCode: 'le', LatestVersion: '1.80' }]));
    if (u.includes('myenrollments'))
      return r.fulfill(json({ PagingInfo: { Bookmark: '', HasMoreItems: false }, Items: [{ OrgUnit: { Id: 102, Name: 'MA 26100 Multivariate Calculus', Code: 'MA-26100' }, Access: { IsActive: true, CanAccess: true, StartDate: null, EndDate: null } }] }));
    if (u.startsWith(`${LE}/102/content/toc`)) return r.fulfill(json(toc));
    if (u.includes('/dropbox/folders/')) return r.fulfill(json([]));
    if (u.includes('/quizzes/')) return r.fulfill(json({ Objects: [], Next: null }));
    if (u.includes('myEvents')) return r.fulfill(json({ Objects: [], Next: null }));
    if (u.includes('/content/enforced/102-MA/syllabus.pdf')) return r.fulfill({ status: 200, contentType: 'application/pdf', body: fs.readFileSync(path.join(ROOT, 'tests/fixtures/syllabus/schedule.pdf')) });
    if (u.includes('rcode=W1')) return r.fulfill(html(launchPage('https://education.wiley.com/was/course')));
    if (u.includes('rcode=W5')) return r.fulfill(html(launchPage('https://education.wiley.com/was/hw11')));
    if (u.includes('rcode=W6')) return r.fulfill(html(launchPage('https://education.wiley.com/was/hw10')));
    const page = u.match(/\/viewContent\/(\d+)\/View/);
    if (page) {
      // The content viewer adds the tool's frame after the page loads; for Wiley topics the frame launches that topic.
      const src = { 1: ql('A1'), 2: ql('N1'), 3: ql('U1'), 4: ql('L1'), 5: ql('W5'), 6: ql('W6') }[page[1]];
      return r.fulfill(html(`<h1>Content</h1><div id="v"></div><script>setTimeout(()=>{const f=document.createElement('iframe');f.src=${JSON.stringify(src)};document.getElementById('v').append(f)},1000)</script>`));
    }
    if (u.includes('rcode=A1')) return r.fulfill(html(launchPage('https://www.aleks.com/hw7')));
    if (u.includes('rcode=N1')) return r.fulfill(html(launchPage('https://digital.wwnorton.com/inq5')));
    if (u.includes('rcode=U1')) return r.fulfill(html(launchPage('https://example-unknown.com/a3')));
    if (u.includes('rcode=L1')) {
      signedOut = true;
      return r.fulfill({ status: 302, headers: { location: `${B}/d2l/login?target=x` } });
    }
    if (u.includes('/d2l/login')) return r.fulfill(html('<h1>Purdue sign in</h1>'));
    if (u.includes('/d2l/home/102')) return r.fulfill(html('<nav><a href="/d2l/le/content/102/Home">Content</a></nav>'));
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://education.wiley.com/**', (r) => {
    const u = r.request().url().replace(/[?#].*$/, ''); // a launch form sent with GET adds a "?" 
    hits.wiley = (hits.wiley ?? 0) + 1;
    if (u.endsWith('/was/course'))
      return r.fulfill(html('<h1>PHYS 172H</h1><ul><li>HW10 <span>Due Monday, Nov 9 at 11:59 PM (EST)</span></li><li>HW11 <span>Due Monday, Nov 16 at 11:59 PM (EST)</span></li></ul>'));
    if (u.endsWith('/was/hw11')) return r.fulfill(html('<main><h1>PHYS 172H - HW11 - FA26</h1><span>Due Monday, Nov 16 at 11:59 PM (EST)</span></main>'));
    if (u.endsWith('/was/hw10')) return r.fulfill(html('<main><h1>PHYS 172H - HW10 - FA26</h1><span>Due Monday, Nov 9 at 11:59 PM (EST)</span></main>'));
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://www.aleks.com/**', (r) => {
    hits.aleks++;
    return r.fulfill(html('<h1>Homework 7</h1><div class="meta"><span>Due Date:</span> <span>11/20/2026 11:59 PM</span></div>'));
  });
  await ctx.route('https://digital.wwnorton.com/**', (r) => {
    hits.norton++;
    return r.fulfill(html('<div id="app"></div><script>setTimeout(()=>{document.getElementById("app").innerHTML="<h1>Ch 5: Culture</h1><p>Due: November 21, 2026, 11:59 PM EST</p>"},1500)</script>'));
  });
  await ctx.route('https://example-unknown.com/**', (r) => {
    hits.unknown++;
    return r.fulfill(html('<p>Due Nov 22</p>'));
  });
  await ctx.route('https://www.gradescope.com/**', (r) => r.fulfill({ status: 302, headers: { location: 'https://www.gradescope.com/login' } }));

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
  check(hw11?.dueAt === '2026-11-17T04:59:00.000Z' && hw11?.platform === 'wileyplus', `Wiley HW11 read from the frame embedded in its Brightspace page (${hw11?.dueAt})`);
  check(hw10?.dueAt === '2026-11-10T04:59:00.000Z', `Wiley HW10, sharing HW11's quick link, gets its own date (${hw10?.dueAt})`);
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
  await page.getByText('Read from ALEKS').first().waitFor({ timeout: 10000 });
  check(true, 'dashboard shows "Read from ALEKS"');
  await page.getByText('DueBoard found example-unknown.com in your courses').waitFor({ timeout: 10000 });
  check(true, 'dashboard offers access for example-unknown.com');
  await page.getByRole('heading', { name: 'From syllabus' }).waitFor({ timeout: 10000 });
  check(true, 'syllabus suggestion listed under "From syllabus"');
  if (process.env.E2E_SCREENSHOT) await page.screenshot({ path: process.env.E2E_SCREENSHOT, fullPage: true });

  console.log('e2e visits: second sync within the hour (signed back in)');
  signedOut = false;
  const before = { ...hits };
  await syncAndWait();
  check(hits.aleks === before.aleks && hits.norton === before.norton, 'no platform page opened again');

  await ctx.close();
  fs.rmSync(ext, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('e2e visits: all checks passed');
})().catch((e) => fail(e.stack || String(e)));
