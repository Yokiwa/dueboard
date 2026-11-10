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
    // Like DataMine: homework launches that land on Gradescope (signed out until one of them is opened), no link
    // titled "Gradescope".
    { Title: 'Projects', Modules: [], Topics: [{ TopicId: 8, Title: 'Project #1', Url: ql('G1'), TypeIdentifier: 'Link' }] },
    {
      // Like PHYS 172: several Wiley homeworks share one quick link (W1) that only reaches the Wiley course page;
      // each content page embeds its own assignment.
      Title: 'HOMEWORK 11',
      Modules: [],
      Topics: [
        { TopicId: 5, Title: 'PHYS 172H - HW11 - FA26', Url: ql('W5'), TypeIdentifier: 'Link' },
        { TopicId: 6, Title: 'PHYS 172H - HW10 - FA26', Url: ql('W6'), TypeIdentifier: 'Link' },
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
  let l1Opened = false;
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
    // One graded, submitted lab due in 2 days: its grade item (77) is in the gradebook as 18/20.
    if (u.includes('/dropbox/folders/501/submissions/')) return r.fulfill(json([{ Submissions: [{ Id: 1 }], CompletionDate: null }]));
    if (u.endsWith('/dropbox/folders/'))
      return r.fulfill(json([{ Id: 501, Name: 'Lab Report 2', IsHidden: false, GradeItemId: 77, DueDate: new Date(Date.now() + 2 * 86400000).toISOString(), Availability: null }]));
    if (u.includes('/dropbox/folders/')) return r.fulfill(json([]));
    if (u.includes('/grades/values/myGradeValues/'))
      return r.fulfill(json([{ GradeObjectIdentifier: '77', GradeObjectName: 'Lab Report 2', PointsNumerator: 18, PointsDenominator: 20, DisplayedGrade: '90 %' }]));
    if (u.includes('/quizzes/')) return r.fulfill(json({ Objects: [], Next: null }));
    if (u.includes('myEvents')) return r.fulfill(json({ Objects: [], Next: null }));
    if (u.includes('/content/enforced/102-MA/syllabus.pdf')) return r.fulfill({ status: 200, contentType: 'application/pdf', body: fs.readFileSync(path.join(ROOT, 'tests/fixtures/syllabus/schedule.pdf')) });
    // Like Purdue's real launch pages, this one hands off in a way DueBoard can't read ahead of time.
    if (u.includes('rcode=W1')) return r.fulfill(html(`<script>location.assign(atob(${JSON.stringify(Buffer.from('https://education.wiley.com/was/course').toString('base64'))}))</script>`));
    // Like Purdue's real launch pages: the hand-off can't be read ahead; Wiley shows a launcher that waits for a click.
    const handOff = (to) => html(`<script>location.assign(atob(${JSON.stringify(Buffer.from(to).toString('base64'))}))</script>`);
    if (u.includes('rcode=W5')) return r.fulfill(handOff('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=L5'));
    if (u.includes('rcode=W6')) return r.fulfill(handOff('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=L6'));
    if (u.includes('rcode=G1')) return r.fulfill(html(launchPage('https://www.gradescope.com/auth/saml/lti')));
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
      // Only the first opening signs the student out; later runs (the score phase) must get past this link.
      if (l1Opened) return r.fulfill(html('<h1>Worksheet 9</h1>'));
      l1Opened = true;
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
    if (u.endsWith('/lti-tool-launcher/index.html')) {
      const id = new URL(r.request().url()).searchParams.get('launchId');
      // L5: a button that opens the assignment with window.open (a new tab); L6: a link with target=_blank.
      return r.fulfill(html(id === 'L5'
        ? `<h1>Launching your assignment</h1><button onclick="window.open('/was/hw11','_blank')">Open Assignment</button><button>Start Over</button>`
        : `<h1>Launching your assignment</h1><a href="/was/hw10" target="_blank">Launch</a>`));
    }
    if (u.endsWith('/was/hw11')) return r.fulfill(html('<main><h1>PHYS 172H - HW11 - FA26</h1><span>Due Monday, Nov 16 at 11:59 PM (EST)</span></main>'));
    if (u.endsWith('/was/hw10')) return r.fulfill(html('<main><h1>PHYS 172H - HW10 - FA26</h1><span>Due Monday, Nov 9 at 11:59 PM (EST)</span><p>Score: 18 / 25 points</p></main>'));
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://www.aleks.com/**', (r) => {
    hits.aleks++;
    // "Question 3/10" is progress, not a score: a finished item with this page must keep a plain "Done" badge.
    return r.fulfill(html('<h1>Homework 7</h1><div class="meta"><span>Due Date:</span> <span>11/20/2026 11:59 PM</span></div><p>Question 3/10</p>'));
  });
  await ctx.route('https://digital.wwnorton.com/**', (r) => {
    hits.norton++;
    return r.fulfill(html('<div id="app"></div><script>setTimeout(()=>{document.getElementById("app").innerHTML="<h1>Ch 5: Culture</h1><p>Due: November 21, 2026, 11:59 PM EST</p>"},1500)</script>'));
  });
  await ctx.route('https://example-unknown.com/**', (r) => {
    hits.unknown++;
    return r.fulfill(html('<p>Due Nov 22</p>'));
  });
  let gradescopeSignedIn = false;
  await ctx.route('https://www.gradescope.com/**', (r) => {
    const u = r.request().url();
    if (u.includes('/auth/saml/lti')) {
      gradescopeSignedIn = true; // the Brightspace entry signs the student in
      return r.fulfill(html('<h1>Your Courses</h1>'));
    }
    if (u.endsWith('/login')) return r.fulfill(html('<form action="/login" method="post"><input name="session[email]"><input type="password" name="session[password]"></form>'));
    // Signed out, Gradescope shows its sign-in form (a 302 can't be mocked for the extension's background requests).
    if (!gradescopeSignedIn) return r.fulfill(html('<form action="/login" method="post"><input name="session[email]"></form>'));
    if (u.endsWith('/account')) return r.fulfill(html(fs.readFileSync(path.join(ROOT, 'tests/fixtures/gradescope/home.html'), 'utf8')));
    if (u.includes('/courses/')) return r.fulfill(html(fs.readFileSync(path.join(ROOT, 'tests/fixtures/gradescope/course.html'), 'utf8')));
    return r.fulfill(html(''));
  });

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
  const hw11Log = vlog.find((e) => e.key === 'brightspace:topic:5');
  check(hw11Log?.siteNote?.startsWith('no launch target on') && !hw11Log.site, `visit log says why the site wasn't known (${hw11Log?.siteNote})`);
  check(vlog.find((e) => e.key === 'brightspace:topic:6')?.clicked?.[0] === 'Launch (education.wiley.com)', 'HW10\'s "Launch" link (meant for a new tab) was followed in the hidden tab');
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

  // Scores. Run after the check above: score visits re-open finished work on every Refresh.
  console.log('e2e visits: scores (Brightspace gradebook, then a score visit after marking work done)');
  // The Courses view (cards use the shared item row). Finished work due within 7 days stays on its card.
  const badges = async () => {
    await page.reload();
    await page.getByRole('tab', { name: 'Courses' }).click();
    await page.getByText('Lab Report 2').first().waitFor({ timeout: 10000 });
    return page.evaluate(() => document.body.innerText);
  };
  let text = await badges();
  check(/Submitted · 18\/20/.test(text), 'Brightspace gradebook score shows on the submitted lab ("Submitted · 18/20")');
  const raw = await page.evaluate(async () => (await chrome.storage.local.get('snapshots')).snapshots?.brightspace?.items?.find((i) => i.sourceItemId === 'dropbox:501')?.score);
  check(raw?.text === '18/20' && raw?.from === 'Brightspace', `score stored locally with its source (${JSON.stringify(raw)})`);

  await page.evaluate(async () => {
    const { userState = {} } = await chrome.storage.local.get('userState');
    const done = { ...(userState.done ?? {}), 'brightspace:topic:6': true, 'brightspace:topic:1': true };
    await chrome.storage.local.set({ userState: { ...userState, done } });
  });
  const beforeScores = { ...hits };
  await syncAndWait();
  check(hits.wiley > beforeScores.wiley && hits.aleks > beforeScores.aleks, 'Refresh re-opened the finished WileyPLUS and ALEKS pages');
  check(hits.norton === beforeScores.norton, 'unfinished InQuizitive page not opened by a score visit');
  const cap = await page.evaluate(async () => (await chrome.storage.local.get('captured')).captured);
  check(cap?.['brightspace:topic:6']?.score?.text === '18/25', `WileyPLUS page score read (${JSON.stringify(cap?.['brightspace:topic:6']?.score)})`);
  check(!cap?.['brightspace:topic:1']?.score, '"Question 3/10" is not a score');
  text = await badges();
  check(/Done · 18\/25/.test(text), 'dashboard shows "Done · 18/25" after the score visit');
  await page.getByText('Show next week').first().click(); // Homework 7 is due in 10 days
  text = await page.evaluate(() => document.body.innerText);
  check(/Homework 7[\s\S]{0,80}\nDone\n/.test(text) && !/3\/10/.test(text.replace('Question 3/10', '')), 'ALEKS item with only "Question 3/10" keeps a plain "Done"');

  await ctx.close();
  fs.rmSync(ext, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('e2e visits: all checks passed');
})().catch((e) => fail(e.stack || String(e)));
