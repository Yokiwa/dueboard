import { IS_FIREFOX } from '../../core/env';
import { ensureOffscreenDocument, offscreenDocumentExists } from '../../sync/offscreenParser';
import { disableFrameHeaders, enableFrameHeaders } from './headers';
import { createFrameHost, type FrameHost } from './host';
import type { FrameResult, FrameVisitRequest } from './protocol';

/** What the background uses to read pages in hidden iframes, whichever browser it runs in. */
export interface FrameApi {
  /** Lets platform pages load in iframes (removes the embedding headers) until end(). */
  begin(): Promise<void>;
  visit(req: FrameVisitRequest): Promise<FrameResult>;
  end(): Promise<void>;
  /** Removes every iframe and resolves pending visits as blocked. Does nothing when there is no frame host yet. */
  reset(): Promise<void>;
}

let backgroundHost: FrameHost | null = null;

/** Firefox only: the background page is the frame host. Created on first use. */
export function getBackgroundFrameHost(): FrameHost {
  if (!backgroundHost) {
    const host = createFrameHost(document);
    window.addEventListener('message', (e) => host.onPost(e));
    backgroundHost = host;
  }
  return backgroundHost;
}

const blocked = (): FrameResult => ({ status: 'blocked', listed: [], frames: [], clicked: [], pages: [] });

async function askOffscreen<T>(msg: Record<string, unknown>): Promise<T | undefined> {
  return (await browser.runtime.sendMessage({ target: 'offscreen', ...msg })) as T | undefined;
}

/**
 * Each begin() takes a hold, stamped with the generation it was taken in; the header rule is on while any hold of the
 * current generation exists. reset() starts a new generation, so an end() that belongs to a run from before the reset
 * only gives back its stale hold and never drops one taken after it. begin, end and reset run one after another, so an
 * enable and a disable never interleave.
 */
let generation = 0;
const holds: number[] = [];
let chain: Promise<void> = Promise.resolve();
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const r = chain.then(work, work);
  chain = r.then(
    () => undefined,
    () => undefined,
  );
  return r;
};
const current = () => holds.filter((g) => g === generation).length;

export function createFrameApi(): FrameApi {
  return {
    begin: () =>
      serial(async () => {
        holds.push(generation);
        if (current() !== 1) return;
        try {
          await enableFrameHeaders();
        } catch (e) {
          holds.pop();
          throw e;
        }
      }),
    end: () =>
      serial(async () => {
        const stale = holds.findIndex((g) => g !== generation);
        if (stale >= 0) {
          holds.splice(stale, 1);
          return;
        }
        if (holds.length === 0) return;
        holds.pop();
        if (holds.length === 0) await disableFrameHeaders();
      }),
    async visit(req) {
      try {
        if (IS_FIREFOX) return await getBackgroundFrameHost().visit(req);
        await ensureOffscreenDocument();
        return (await askOffscreen<FrameResult>({ kind: 'frameVisit', req })) ?? blocked();
      } catch {
        // The frame host is gone (for example the offscreen document closed): this page could not be read.
        return blocked();
      }
    },
    async reset() {
      await serial(async () => {
        generation++;
        await disableFrameHeaders();
      });
      if (IS_FIREFOX) {
        backgroundHost?.reset();
        return;
      }
      if (!(await offscreenDocumentExists())) return;
      await askOffscreen({ kind: 'frameReset' });
    },
  };
}
