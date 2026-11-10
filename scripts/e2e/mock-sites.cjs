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
const ql = (r) => `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=102&type=lti&rcode=${r}`;

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

const json = (body) => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const html = (body, headers = {}) => ({ status: 200, headers: { 'content-type': 'text/html', ...headers }, body });
const notFound = () => ({ status: 404, headers: {}, body: '' });
const handOff = (to) => html(`<script>location.assign(atob(${JSON.stringify(Buffer.from(to).toString('base64'))}))</script>`);

function createMocks() {
  const state = {
    hits: { aleks: 0, norton: 0, unknown: 0, wiley: 0, framed: 0 },
    signedOut: false, // the session expires when the Worksheet 9 link is opened
    gradescopeSignedIn: false,
  };

  function brightspace(u) {
    if (u.includes('/users/whoami')) return state.signedOut ? { status: 401, headers: {}, body: '' } : json({ Identifier: '1', FirstName: 'Test' });
    if (u.endsWith('/d2l/api/versions/')) return json([{ ProductCode: 'lp', LatestVersion: '1.47' }, { ProductCode: 'le', LatestVersion: '1.80' }]);
    if (u.includes('myenrollments'))
      return json({ PagingInfo: { Bookmark: '', HasMoreItems: false }, Items: [{ OrgUnit: { Id: 102, Name: 'MA 26100 Multivariate Calculus', Code: 'MA-26100' }, Access: { IsActive: true, CanAccess: true, StartDate: null, EndDate: null } }] });
    if (u.startsWith(`${LE}/102/content/toc`)) return json(toc);
    if (u.includes('/dropbox/folders/')) return json([]);
    if (u.includes('/quizzes/')) return json({ Objects: [], Next: null });
    if (u.includes('myEvents')) return json({ Objects: [], Next: null });
    if (u.includes('/content/enforced/102-MA/syllabus.pdf')) return { status: 200, headers: { 'content-type': 'application/pdf' }, body: fs.readFileSync(path.join(ROOT, 'tests/fixtures/syllabus/schedule.pdf')) };
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
      // L5: a button that opens the assignment with window.open (a new tab); L6: a link with target=_blank.
      return html(id === 'L5'
        ? `<h1>Launching your assignment</h1><button onclick="window.open('/was/hw11','_blank')">Open Assignment</button><button>Start Over</button>`
        : `<h1>Launching your assignment</h1><a href="/was/hw10" target="_blank">Launch</a>`);
    }
    if (u.endsWith('/was/hw11')) return html('<main><h1>PHYS 172H - HW11 - FA26</h1><span>Due Monday, Nov 16 at 11:59 PM (EST)</span></main>');
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
  function respond(req) {
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
          return html('<h1>Homework 7</h1><p>Due Date: 11/20/2026 11:59 PM</p>', {
            'x-frame-options': 'DENY',
            'content-security-policy': "frame-ancestors 'none'",
          });
        }
        state.hits.aleks++;
        return html('<h1>Homework 7</h1><div class="meta"><span>Due Date:</span> <span>11/20/2026 11:59 PM</span></div>');
      case 'digital.wwnorton.com':
        state.hits.norton++;
        return html('<div id="app"></div><script>setTimeout(()=>{document.getElementById("app").innerHTML="<h1>Ch 5: Culture</h1><p>Due: November 21, 2026, 11:59 PM EST</p>"},1500)</script>');
      case 'example-unknown.com':
        state.hits.unknown++;
        return html('<p>Due Nov 22</p>');
      case 'www.gradescope.com':
        return gradescope(u);
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
      const out = mocks.respond({ url: `https://${host}${req.url}`, method: req.method, headers: req.headers });
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
