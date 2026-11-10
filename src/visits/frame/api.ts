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

export function createFrameApi(): FrameApi {
  return {
    begin: enableFrameHeaders,
    end: disableFrameHeaders,
    async visit(req) {
      if (IS_FIREFOX) return getBackgroundFrameHost().visit(req);
      await ensureOffscreenDocument();
      return (await askOffscreen<FrameResult>({ kind: 'frameVisit', req })) ?? blocked();
    },
    async reset() {
      if (IS_FIREFOX) {
        backgroundHost?.reset();
        return;
      }
      if (!(await offscreenDocumentExists())) return;
      await askOffscreen({ kind: 'frameReset' });
    },
  };
}
