import { BRIGHTSPACE_HOST, SIGN_IN, sessionDone } from '../hosts';
import { isVisitMessage, stripUrl, type VisitMessage } from '../messages';
import type { PageSample } from '../runner';
import {
  isHelloPost,
  type FrameConfig,
  type FrameResult,
  type FrameVisitRequest,
  type Listed,
} from './protocol';

const DEFAULT_HELLO_MS = 20_000;
const DEFAULT_READ_MS = 22_000;
const MAX_DEPTH = 10;
const MAX_SAMPLES = 6;

type Inner = VisitMessage | { type: 'visitListed'; listed: Listed[] };

export interface FrameHost {
  visit(req: FrameVisitRequest): Promise<FrameResult>;
  onPost(e: { data: unknown; source: unknown; origin: string }): void;
  onMessage(m: unknown): FrameConfig | null | undefined;
  reset(): void;
}

interface Visit {
  req: FrameVisitRequest;
  iframe: HTMLIFrameElement;
  startedAt: number;
  helloMs: number;
  readMs: number;
  nonces: Map<string, { direct: boolean }>;
  readStart?: number;
  timer?: ReturnType<typeof setTimeout>;
  finish(r: FrameResult['status'], extra?: Partial<FrameResult>): void;
  host?: string;
  landed?: string;
  /** The landing came from the iframe itself (not from a frame Brightspace embeds): nested frames no longer move it. */
  hostDirect?: boolean;
  frames: FrameResult['frames'];
  clicked: string[];
  pages: PageSample[];
  listed: Listed[];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isFoundShape = (v: unknown): boolean => {
  const o = v as { title?: unknown; dueAt?: unknown; evidence?: unknown } | null;
  return !!o && typeof o === 'object' && isStr(o.title) && isStr(o.dueAt) && isStr(o.evidence);
};

/** The inner message of a frameMessage, checked field by field, or null when it is not one the host knows. */
function checkInner(m: unknown): Inner | null {
  const o = m as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  if (o.type === 'visitListed') {
    if (!Array.isArray(o.listed)) return null;
    const ok = o.listed.every((l) => {
      const e = l as { key?: unknown; found?: unknown } | null;
      return !!e && typeof e === 'object' && isStr(e.key) && isFoundShape(e.found);
    });
    return ok ? (o as Inner) : null;
  }
  if (!isVisitMessage(o)) return null;
  switch (o.type) {
    case 'visitFrame':
      return isStr(o.frameUrl) && typeof o.top === 'boolean' ? o : null;
    case 'visitSample':
      return isStr(o.frameUrl) && isStr(o.text) && isStrArray(o.buttons) ? o : null;
    case 'visitClick':
      return isStr(o.label) && isStr(o.frameUrl) ? o : null;
    case 'visitFound':
      return isStr(o.frameUrl) && typeof o.top === 'boolean' && (o.found === null || isFoundShape(o.found)) ? o : null;
    case 'visitText':
      return isStr(o.frameUrl) && isStrArray(o.lines) ? o : null;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Owns the iframes the frames are read in. A reader in a frame says hello (postMessage, nonce only); the host binds the
 * nonce to the visit whose iframe contains that window, answers with an ack, and from then on trusts runtime messages
 * carrying that nonce. One visit is one iframe, removed when the visit ends.
 */
export function createFrameHost(doc: Document, timers: { now(): number } = { now: () => Date.now() }): FrameHost {
  const visits = new Map<string, Visit>();
  const byNonce = new Map<string, Visit>();

  const owner = (source: unknown): { visit: Visit; direct: boolean } | null => {
    let w = source as { parent?: unknown } | null;
    for (let depth = 0; depth < MAX_DEPTH && w && typeof w === 'object'; depth++) {
      for (const v of visits.values()) {
        if (v.iframe.contentWindow && (v.iframe.contentWindow as unknown) === w) return { visit: v, direct: depth === 0 };
      }
      const next = w.parent;
      if (next === w) return null;
      w = next as { parent?: unknown } | null;
    }
    return null;
  };

  const arm = (v: Visit) => {
    clearTimeout(v.timer);
    let at: number;
    let status: FrameResult['status'] = 'blocked';
    if (v.readStart !== undefined) {
      at = v.readStart + v.readMs;
      status = v.req.mode === 'session' ? 'blocked' : 'none';
    } else if (v.nonces.size === 0) {
      at = v.startedAt + v.helloMs;
    } else {
      at = v.startedAt + v.helloMs + v.readMs;
    }
    v.timer = setTimeout(() => v.finish(status), Math.max(0, at - timers.now()));
  };

  const handle = (v: Visit, direct: boolean, m: Inner) => {
    switch (m.type) {
      case 'visitFrame': {
        if (!v.frames.some((f) => f.url === m.frameUrl && f.top === m.top)) v.frames.push({ url: m.frameUrl, top: m.top });
        if (direct && SIGN_IN.test(m.frameUrl)) return v.finish('signed_out');
        const host = hostnameOf(m.frameUrl);
        if (host === BRIGHTSPACE_HOST || SIGN_IN.test(m.frameUrl)) return;
        // Brightspace shows a platform inside its own launch page, so the platform page is often a nested frame. It counts
        // until the iframe itself shows a platform page; frames nested in that one (ads, widgets) never move the landing.
        if (!direct && v.hostDirect) return;
        v.host = host;
        v.landed = m.frameUrl;
        if (direct) v.hostDirect = true;
        if (v.req.mode === 'session') {
          if (sessionDone(v.req.platform, m.frameUrl)) return v.finish('landed');
          return;
        }
        if (v.readStart === undefined) {
          v.readStart = timers.now();
          arm(v);
        }
        return;
      }
      case 'visitFound':
        if (m.found && v.req.mode === 'due') v.finish('found', { found: m.found });
        // The page the visit landed on read itself in full and has no date: no need to wait out the read time, unless a
        // button was pressed (the page it opens may still come).
        else if (!m.found && v.req.mode === 'due' && v.readStart !== undefined && v.clicked.length === 0 && stripUrl(m.frameUrl) === v.landed) v.finish('none');
        return;
      case 'visitText':
        if (v.req.mode === 'syllabus') v.finish('text', { lines: m.lines });
        return;
      case 'visitClick': {
        const host = hostnameOf(m.frameUrl);
        v.clicked.push(host ? `${m.label} (${host})` : m.label);
        return;
      }
      case 'visitSample': {
        const entry = { url: m.frameUrl, text: m.text, buttons: m.buttons };
        const i = v.pages.findIndex((p) => p.url === m.frameUrl);
        if (i >= 0) v.pages[i] = entry;
        else if (v.pages.length < MAX_SAMPLES) v.pages.push(entry);
        return;
      }
      case 'visitListed':
        v.listed.push(...m.listed);
        return;
    }
  };

  return {
    visit(req) {
      return new Promise<FrameResult>((resolve) => {
        const iframe = doc.createElement('iframe');
        iframe.name = `dueboard-${req.token}`;
        // No page in a hidden frame may open a tab or window, whatever way it tries (the browser enforces it for nested
        // frames too): one that only works in a new tab is left to the minimized window instead of appearing in front
        // of the student. Same origin kept, so scripts, forms, cookies and DueBoard's handshake work as usual.
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
        iframe.src = req.url;
        const v: Visit = {
          req,
          iframe,
          startedAt: timers.now(),
          helloMs: req.helloMs ?? DEFAULT_HELLO_MS,
          readMs: req.readMs ?? DEFAULT_READ_MS,
          nonces: new Map(),
          frames: [],
          clicked: [],
          pages: [],
          listed: [],
          finish: (status, extra) => {
            if (visits.get(req.token) !== v) return;
            clearTimeout(v.timer);
            visits.delete(req.token);
            for (const n of v.nonces.keys()) byNonce.delete(n);
            iframe.remove();
            resolve({
              status,
              ...(v.host !== undefined ? { host: v.host } : {}),
              ...(v.landed !== undefined ? { landed: v.landed } : {}),
              ...extra,
              listed: v.listed,
              frames: v.frames,
              clicked: v.clicked,
              pages: v.pages,
            });
          },
        };
        visits.get(req.token)?.finish('blocked');
        visits.set(req.token, v);
        arm(v);
        (doc.body ?? doc.documentElement).appendChild(iframe);
      });
    },

    onPost(e) {
      // A sandboxed frame has the opaque origin 'null': no ack can be addressed to it, so it is never bound.
      if (e.origin === 'null' || !isHelloPost(e.data) || byNonce.has(e.data.nonce)) return;
      const hit = owner(e.source);
      if (!hit) return;
      const nonce = e.data.nonce;
      hit.visit.nonces.set(nonce, { direct: hit.direct });
      byNonce.set(nonce, hit.visit);
      try {
        (e.source as { postMessage(m: unknown, origin: string): void }).postMessage({ dueboard: 'ack', nonce }, e.origin);
      } catch {
        // No ack went out, so the reader will not use this nonce: do not leave it bound.
        hit.visit.nonces.delete(nonce);
        byNonce.delete(nonce);
      }
      arm(hit.visit);
    },

    onMessage(m) {
      const r = m as { type?: unknown; nonce?: unknown; message?: unknown } | null;
      if (!r || typeof r !== 'object' || (r.type !== 'frameConfig' && r.type !== 'frameMessage') || typeof r.nonce !== 'string') return undefined;
      const v = byNonce.get(r.nonce);
      if (!v) return null;
      if (r.type === 'frameConfig') {
        // Sign-in visits may press one link too (Pearson's Assignments), which may open a new tab: it opens in the frame.
        return { mode: v.req.mode, platform: v.req.platform, allowOpen: v.req.mode === 'due' || v.req.mode === 'session', titles: v.req.titles ?? [] };
      }
      const inner = checkInner(r.message);
      if (inner) handle(v, v.nonces.get(r.nonce)!.direct, inner);
      return null;
    },

    reset() {
      for (const v of [...visits.values()]) v.finish('blocked');
      doc.querySelectorAll('iframe[name^="dueboard-"]').forEach((f) => f.remove());
    },
  };
}
