export interface FakeRoute {
  status?: number;
  body: unknown;
  redirectedTo?: string;
}

/** Builds a fetch replacement that answers by URL prefix match (longest prefix wins). */
export function fakeFetch(routes: Record<string, FakeRoute | (() => FakeRoute | Promise<FakeRoute>)>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response('not found', { status: 404 });
    const entry = routes[key]!;
    const r: FakeRoute = typeof entry === "function" ? await entry() : entry;
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    const res = new Response(text, { status: r.status ?? 200 });
    Object.defineProperty(res, 'url', { value: r.redirectedTo ?? url });
    Object.defineProperty(res, 'redirected', { value: Boolean(r.redirectedTo) });
    return res;
  }) as typeof fetch;
  return { impl, calls };
}
