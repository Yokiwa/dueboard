/** The platform says we are not logged in (401/403 or a redirect to a login page). */
export class AuthError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'AuthError';
  }
}
/** Any other failure: offline, server error, unexpected body. */
export class NetworkError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'NetworkError';
  }
}

const LOGIN_URL = /\/d2l\/login|login\.purdue\.edu|gradescope\.com\/login|\/saml\//i;

async function request(url: string, fetchImpl: typeof fetch): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: 'include' });
  } catch (e) {
    throw new NetworkError(`${url}: ${String(e)}`);
  }
  if (res.status === 401 || res.status === 403) throw new AuthError(`${url}: HTTP ${res.status}`);
  if (res.redirected && LOGIN_URL.test(res.url)) throw new AuthError(`${url}: redirected to ${res.url}`);
  if (!res.ok) throw new NetworkError(`${url}: HTTP ${res.status}`);
  return res;
}

export async function getJson(url: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<unknown> {
  const res = await request(url, fetchImpl);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new NetworkError(`${url}: response was not JSON`);
  }
}

export async function getHtml(url: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<string> {
  const res = await request(url, fetchImpl);
  return res.text();
}
