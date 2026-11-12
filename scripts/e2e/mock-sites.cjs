// Simulated Brightspace and platform sites shared by the end-to-end scripts.
// `respond` is transport-agnostic: Playwright routes (tabs, service worker) and the local HTTPS server (hidden
// frames, which Playwright cannot route) both answer from it, so the two cannot drift apart.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const B = 'https://purdue.brightspace.com';
const LE = `${B}/d2l/api/le/1.80`;

// Minimal one-page syllabus PDF built at run time so the dated rows stay in the future whatever today is.
function syllabusPdf(now = new Date()) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const at = (days) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const lines = ['Course Schedule', `${at(-3)} Exam 2`, `${at(4)} Project proposal due`];
  const content = 'BT /F1 14 Tf 72 720 Td 18 TL\n' + lines.map((l) => `(${l}) Tj T*`).join('\n') + '\nET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const ql = (r, ou = 102) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=${ou}&type=lti&rcode=${r}`;

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
// The background-reading course (createMocks({ scenario: 'background' })): one course, every kind of page the hidden
// frames and the window fallback have to deal with. `frameless` and `frameless2` are switched on by the script.
const backgroundToc = (state) => {
  const link = (id, title, r) => ({ TopicId: id, Title: title, Url: ql(r, 103), TypeIdentifier: 'Link' });
  const topics = [
    link(21, 'Framed Homework', 'F1'), // refuses framing; the header rule lets the hidden frame read it
    link(23, 'Problem Set 1', 'P1'), // three homeworks listed on one page
    link(24, 'Problem Set 2', 'P2'),
    link(25, 'Problem Set 3', 'P3'),
    // Like Purdue's real launch pages: Brightspace shows the platform in a frame inside its own page.
    link(29, 'Embedded Homework', 'E1'), // the embedded page refuses framing too
    link(30, 'Embedded Launcher', 'E2'), // a launcher that kept its own window.open and opens an empty window first
    link(31, 'Embedded Course Page', 'E3'), // a page without a date: read in the background, no window
    link(32, 'New Window Homework', 'E4'), // a tool set to "open in a new window": Brightspace posts its form to a new tab
    link(33, 'Script Link Homework', 'E5'), // the launch page's script clicks a link it never added to the page (target=_blank)
  ];
  if (state.pearson) topics.push(link(40, 'Access Pearson', 'S2')); // the course's Pearson entry (signs in to MyLab)
  if (state.unknownSite) topics.push(link(26, 'Lab Report', 'U1')); // an unknown site: DueBoard asks for access, never reads it
  if (state.unknownSite2) topics.push(link(28, 'Lab Report Two', 'U2'));
  if (state.frameless) topics.push(link(22, 'Windowed Homework', 'X1')); // a page no hidden frame can read
  if (state.frameless2) topics.push(link(27, 'Windowed Homework Two', 'X2'));
  return { Modules: [{ Title: 'Homework', Modules: [], Topics: topics }] };
};
/** Brightspace's own launch page with the platform in a frame, as Purdue's componentLaunch pages show it. */
const embedPage = (target) => `<html><body><h1>Brightspace</h1><iframe src="${target}" width="900" height="600"></iframe></body></html>`;
const launchPage = (target) =>
  `<html><body><form id="f" action="${target}" method="get"></form><script>document.getElementById('f').submit()</script></body></html>`;

const json = (body) => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const html = (body, headers = {}) => ({ status: 200, headers: { 'content-type': 'text/html', ...headers }, body });
const notFound = () => ({ status: 404, headers: {}, body: '' });
const handOffAfter = (to, ms) => html(`<p>Signing you in…</p><script>setTimeout(() => location.assign(atob(${JSON.stringify(Buffer.from(to).toString('base64'))})), ${ms})</script>`);
const handOff = (to) => html(`<script>location.assign(atob(${JSON.stringify(Buffer.from(to).toString('base64'))}))</script>`);

function createMocks({ scenario = 'default' } = {}) {
  const background = scenario === 'background';
  const state = {
    unknownSite: false,
    unknownSite2: false,
    frameless: false,
    frameless2: false,
    hits: { aleks: 0, norton: 0, unknown: 0, wiley: 0, framed: 0, nodate: 0, mylab: 0 },
    pearson: false, // the course links to Pearson
    pearsonFrameBroken: false, // Pearson's page can't be read in a hidden frame, so signing in needs the window
    mylabSignedIn: false, // a MyLab page has been opened (the session the Pearson connector reads with)
    signedOut: false, // the session expires when the Worksheet 9 link is opened
    gradescopeSignedIn: false,
  };

  function brightspace(u) {
    if (u.includes('/users/whoami')) return state.signedOut ? { status: 401, headers: {}, body: '' } : json({ Identifier: '1', FirstName: 'Test' });
    if (u.endsWith('/d2l/api/versions/')) return json([{ ProductCode: 'lp', LatestVersion: '1.47' }, { ProductCode: 'le', LatestVersion: '1.80' }]);
    if (background && state.signedOut && u.includes('/d2l/api/')) return { status: 401, headers: {}, body: '' };
    if (background && u.includes('myenrollments'))
      return json({ PagingInfo: { Bookmark: '', HasMoreItems: false }, Items: [{ OrgUnit: { Id: 103, Name: 'CS 18000 Problem Solving', Code: 'CS-18000' }, Access: { IsActive: true, CanAccess: true, StartDate: null, EndDate: null } }] });
    if (background && u.startsWith(`${LE}/103/content/toc`)) return json(backgroundToc(state));
    if (background) {
      const rc = /rcode=(\w+)/.exec(u)?.[1];
      const to = { F1: 'https://www.aleks.com/framed/hw7', X1: 'https://www.aleks.com/frameless/hw8', X2: 'https://www.aleks.com/frameless/hw9', P1: 'https://digital.wwnorton.com/list/ps', P2: 'https://digital.wwnorton.com/list/ps', P3: 'https://digital.wwnorton.com/list/ps', U1: 'https://example-unknown.com/a3', U2: 'https://example-unknown2.com/a4' }[rc];
      if (to) return html(launchPage(to));
      // Like Purdue's Pearson entry: in a tab it goes to Pearson; inside a frame, Brightspace shows Pearson in a frame.
      if (rc === 'S2')
        return html(`<script>const to = 'https://interop.pearson.com/security/login'; if (window.top === window) location.assign(to); else document.write('<iframe src="' + to + '"></iframe>');</script>`);
      const embedded = { S1: 'https://interop.pearson.com/launch', E1: 'https://www.aleks.com/framed/hw10', E2: 'https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=L7', E3: 'https://www.aleks.com/nodate/course' }[rc];
      if (embedded) return html(embedPage(embedded));
      // A way out that DueBoard's page scripts do not catch: window.open called through a blank child frame.
      if (rc === 'E6')
        return html(`<h1>Brightspace</h1><script>const f = document.createElement('iframe'); document.body.append(f); f.contentWindow.open('https://www.aleks.com/framed/hw13', '_blank');</script>`);
      if (rc === 'E5')
        return html(`<h1>Brightspace</h1><script>const a = document.createElement('a'); a.href = 'https://www.aleks.com/framed/hw12'; a.target = '_blank'; a.click();</script>`);
      if (rc === 'E4')
        return html(`<h1>Brightspace</h1><p>This tool opens in a new window.</p><form id="f" action="https://www.aleks.com/framed/hw11" method="get" target="_blank"></form><script>document.getElementById('f').submit()</script>`);
      // Signed in, the home page loads; signed out it goes to the sign-in page, like the real one.
      if (/\/d2l\/home\/?$/.test(new URL(u).pathname)) return state.signedOut ? { status: 302, headers: { location: `${B}/d2l/login?target=x` }, body: '' } : html('<h1>Home</h1>');
    }
    if (u.includes('myenrollments'))
      return json({ PagingInfo: { Bookmark: '', HasMoreItems: false }, Items: [{ OrgUnit: { Id: 102, Name: 'MA 26100 Multivariate Calculus', Code: 'MA-26100' }, Access: { IsActive: true, CanAccess: true, StartDate: null, EndDate: null } }] });
    if (u.startsWith(`${LE}/102/content/toc`)) return json(toc);
    if (u.includes('/dropbox/folders/')) return json([]);
    if (u.includes('/quizzes/')) return json({ Objects: [], Next: null });
    if (u.includes('myEvents')) return json({ Objects: [], Next: null });
    if (u.includes('/content/enforced/102-MA/syllabus.pdf')) return { status: 200, headers: { 'content-type': 'application/pdf' }, body: syllabusPdf() };
    // Like Purdue's real launch pages, this one hands off in a way DueBoard can't read ahead of time.
    if (u.includes('rcode=W1')) return handOff('https://education.wiley.com/was/course');
    // Like Purdue's real launch pages: the hand-off can't be read ahead; Wiley shows a launcher that waits for a click.
    if (u.includes('rcode=W5')) return handOff('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=L5');
    if (u.includes('rcode=W6')) return handOff('https://education.wiley.com/was/ui/v2/lti-tool-launcher/index.html?launchId=L6');
    if (u.includes('rcode=G1')) return html(launchPage('https://www.gradescope.com/auth/saml/lti'));
    const page = u.match(/\/viewContent\/(\d+)\/View/);
    if (page) {
      // The content viewer adds the tool's frame after the page loads; for Wiley topics the frame launches that topic.
      const src = { 1: ql('A1'), 2: ql('N1'), 3: ql('U1'), 4: ql('L1'), 5: ql('W5'), 6: ql('W6') }[page[1]];
      return html(`<h1>Content</h1><div id="v"></div><script>setTimeout(()=>{const f=document.createElement('iframe');f.src=${JSON.stringify(src)};document.getElementById('v').append(f)},1000)</script>`);
    }
    if (u.includes('rcode=A1')) return html(launchPage('https://www.aleks.com/hw7'));
    if (u.includes('rcode=N1')) return html(launchPage('https://digital.wwnorton.com/inq5'));
    if (u.includes('rcode=U1')) return html(launchPage('https://example-unknown.com/a3'));
    if (u.includes('rcode=L1')) {
      state.signedOut = true;
      return { status: 302, headers: { location: `${B}/d2l/login?target=x` }, body: '' };
    }
    if (u.includes('/d2l/login')) return html('<h1>Purdue sign in</h1>');
    if (u.includes('/d2l/home/102')) return html('<nav><a href="/d2l/le/content/102/Home">Content</a></nav>');
    return notFound();
  }

  function wiley(raw) {
    const u = raw.replace(/[?#].*$/, ''); // a launch form sent with GET adds a "?"
    state.hits.wiley++;
    if (u.endsWith('/was/course'))
      return html('<h1>PHYS 172H</h1><ul><li>HW10 <span>Due Monday, Nov 9 at 11:59 PM (EST)</span></li><li>HW11 <span>Due Monday, Nov 16 at 11:59 PM (EST)</span></li></ul>');
    if (u.endsWith('/lti-tool-launcher/index.html')) {
      const id = new URL(raw).searchParams.get('launchId');
      // L7: a launcher that took its own copy of window.open when it loaded and opens an empty window, then sets its address.
      if (id === 'L7')
        return html(`<h1>Launching your assignment</h1><script>const openTab = window.open.bind(window);</script><button onclick="const w = openTab('', '_blank'); w.location = '/was/hw12'">Open Assignment</button>`);
      // L5: a button that opens the assignment with window.open (a new tab); L6: a link with target=_blank.
      return html(id === 'L5'
        ? `<h1>Launching your assignment</h1><button onclick="window.open('/was/hw11','_blank')">Open Assignment</button><button>Start Over</button>`
        : `<h1>Launching your assignment</h1><a href="/was/hw10" target="_blank">Launch</a>`);
    }
    if (u.endsWith('/was/hw11')) return html('<main><h1>PHYS 172H - HW11 - FA26</h1><span>Due Monday, Nov 16 at 11:59 PM (EST)</span></main>');
    if (u.endsWith('/was/hw12')) return html('<main><h1>Embedded Launcher</h1><span>Due Monday, Nov 23 at 11:59 PM (EST)</span></main>');
    if (u.endsWith('/was/hw10')) return html('<main><h1>PHYS 172H - HW10 - FA26</h1><span>Due Monday, Nov 9 at 11:59 PM (EST)</span></main>');
    return notFound();
  }

  function gradescope(u) {
    if (u.includes('/auth/saml/lti')) {
      state.gradescopeSignedIn = true; // the Brightspace entry signs the student in
      return html('<h1>Your Courses</h1>');
    }
    if (u.endsWith('/login')) return html('<form action="/login" method="post"><input name="session[email]"><input type="password" name="session[password]"></form>');
    // Signed out, Gradescope shows its sign-in form (a 302 can't be mocked for the extension's background requests).
    if (!state.gradescopeSignedIn) return html('<form action="/login" method="post"><input name="session[email]"></form>');
    if (u.endsWith('/account')) return html(fs.readFileSync(path.join(ROOT, 'tests/fixtures/gradescope/home.html'), 'utf8'));
    if (u.includes('/courses/')) return html(fs.readFileSync(path.join(ROOT, 'tests/fixtures/gradescope/course.html'), 'utf8'));
    return html('');
  }

  /** @param {{ url: string, method?: string, headers?: Record<string, string> }} req */
  function respond(req, via = 'route') {
    const url = new URL(req.url);
    const u = req.url;
    switch (url.host) {
      case 'purdue.brightspace.com':
        return brightspace(u);
      case 'education.wiley.com':
        return wiley(u);
      case 'www.aleks.com':
        // A page that refuses to be framed, like the real platforms. Read by hidden frames only (the header rule lifts it).
        if (url.pathname.startsWith('/framed/')) {
          state.hits.framed++;
          const day = url.pathname.endsWith('hw10') ? '11/24/2026' : url.pathname.endsWith('hw11') ? '11/25/2026' : url.pathname.endsWith('hw12') ? '11/26/2026' : '11/20/2026';
          return html(`<h1>Homework</h1><p>Due Date: ${day} 11:59 PM</p>`, {
            'x-frame-options': 'DENY',
            'content-security-policy': "frame-ancestors 'none'",
          });
        }
        // A page no hidden frame can read (the local server answers frames with an error) that the window tab reads fine.
        if (url.pathname.startsWith('/nodate/')) {
          state.hits.nodate++;
          return html('<nav>Dashboard / Regrade Requests / Instructors / Course staff</nav><h1>TDM 10100 · The Data Mine Seminar I</h1><p>You have no submission for Project 1.</p><p>Credit Hours: 1.00. A supportive environment for students in any major who want to learn data science.</p><table><tr><td>Project 1</td><td>Ungraded</td><td>10 pts</td></tr></table>');
        }
        if (url.pathname.startsWith('/frameless/')) {
          if (via === 'server') return { status: 500, headers: { 'content-type': 'text/html' }, body: '' };
          const day = url.pathname.endsWith('hw9') ? '11/18/2026' : '11/19/2026';
          return html(`<h1>Homework</h1><div class="meta"><span>Due Date:</span> <span>${day} 11:59 PM</span></div>`);
        }
        state.hits.aleks++;
        return html('<h1>Homework 7</h1><div class="meta"><span>Due Date:</span> <span>11/20/2026 11:59 PM</span></div>');
      case 'digital.wwnorton.com':
        if (url.pathname.startsWith('/list/'))
          return html('<h1>Problem sets</h1><ul><li>Problem Set 1 Due: November 21, 2026, 11:59 PM EST</li><li>Problem Set 2 Due: November 28, 2026, 11:59 PM EST</li><li>Problem Set 3 Due: December 5, 2026, 11:59 PM EST</li></ul>');
        state.hits.norton++;
        return html('<div id="app"></div><script>setTimeout(()=>{document.getElementById("app").innerHTML="<h1>Ch 5: Culture</h1><p>Due: November 21, 2026, 11:59 PM EST</p>"},1500)</script>');
      case 'example-unknown2.com':
        return html('<p>Due Nov 23</p>');
      case 'example-unknown.com':
        state.hits.unknown++;
        return html('<p>Due Nov 22</p>');
      case 'www.gradescope.com':
        return gradescope(u);
      // Pearson's page for Brightspace: MyLab signs the student in only when its Assignments link is opened (new tab).
      case 'interop.pearson.com':
        // The first stop hands off at once (the moment DueBoard may be putting its reader on it), then on to Pearson's
        // course page.
        if (url.pathname === '/security/login') return handOff('https://interop.pearson.com/launch');
        if (via === 'server' && state.pearsonFrameBroken) return { status: 500, headers: { 'content-type': 'text/html' }, body: '' };
        return handOff('https://console.pearson.com/courses/c1/dashboard?contextType=interop');
      // Like Purdue's "Access Pearson for D2L Brightspace": a slow app whose Assignments link (href="#") opens an empty
      // new tab and then sends it to MyLab's launch address.
      case 'console.pearson.com':
        return html(`<h1>Access Pearson for D2L Brightspace</h1><div id="app">Loading…</div><script>setTimeout(() => { document.getElementById('app').innerHTML = '<article><a href="#" aria-label="Open (opens in a new tab)">Open</a></article><ul aria-label="Course links"><li><a id="as" class="link-text" href="#" aria-label="Assignments, , opens in new tab"><span>Assignments</span></a></li><li><a href="#" aria-label="Results, , opens in new tab"><span>Results</span></a></li></ul>'; document.getElementById('as').addEventListener('click', (e) => { e.preventDefault(); const w = window.open('', '_blank'); setTimeout(() => { w.location = 'https://mylab.pearson.com/api/v1/courses/1/links/assignments/launch'; }, 300); }); }, 3000);</script>`);
      case 'mylab.pearson.com': {
        state.hits.mylab++;
        // MyLab's launch address hands off once more; the session exists only once the page it leads to has loaded.
        if (url.pathname.startsWith('/api/')) return handOffAfter('https://mylab.pearson.com/Student/DoAssignments.aspx?view=all&from=launch', 1500);
        // Opening MyLab from Pearson's Brightspace page signs the student in; DueBoard's own request reads with that session.
        if (url.searchParams.get('from') === 'launch') state.mylabSignedIn = true;
        if (!state.mylabSignedIn) return html(fs.readFileSync(path.join(ROOT, 'tests/fixtures/pearson/login.html'), 'utf8'));
        if (!state.pearson) return html('<h1>Homework and Tests</h1><table class="assignement-list-table"><tr><td>08/29/26 11:59pm</td><td>Lesson 1</td></tr></table>');
        return html(fs.readFileSync(path.join(ROOT, 'tests/fixtures/pearson/assignments.html'), 'utf8'));
      }
      default:
        return notFound();
    }
  }

  return { respond, state };
}

/** HTTPS server answering from `mocks.respond`. Hostnames are told apart by the Host header. */
async function startServer(mocks, { port = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dueboard-e2e-cert-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=dueboard-e2e'], { stdio: 'ignore' });
    const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
      const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
      const out = mocks.respond({ url: `https://${host}${req.url}`, method: req.method, headers: req.headers }, 'server');
      res.writeHead(out.status, out.headers);
      res.end(out.body);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    return {
      port: server.address().port,
      close: () =>
        new Promise((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections?.();
          fs.rmSync(dir, { recursive: true, force: true });
        }),
    };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

module.exports = { createMocks, startServer };
