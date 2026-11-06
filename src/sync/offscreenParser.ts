import { browser } from 'wxt/browser';
import { domGradescopeParser, GradescopeParseError, type GradescopeParser } from '../connectors/gradescope/parse';
import { parsePearson, PearsonParseError, type PearsonPage } from '../connectors/pearson/parse';

type OffscreenReply = { data: unknown } | { error: string; errorName: string };

/** Runs inside the offscreen document, where DOMParser exists. */
export function handleOffscreenMessage(msg: unknown): OffscreenReply | undefined {
  const m = msg as { target?: string; kind?: string; html?: string; courseId?: string } | null;
  if (!m || m.target !== 'offscreen') return undefined;
  try {
    if (m.kind === 'home') return { data: domGradescopeParser.home(m.html ?? '') };
    if (m.kind === 'course') return { data: domGradescopeParser.course(m.html ?? '', m.courseId ?? '') };
    if (m.kind === 'pearson') return { data: parsePearson(m.html ?? '') };
    return { error: `unknown kind ${m.kind}`, errorName: 'Error' };
  } catch (e) {
    return { error: (e as Error).message, errorName: (e as Error).name };
  }
}

/** A GradescopeParser for the service worker: forwards HTML to the offscreen document and unwraps the answer. */
export function createProxyParser(send: (msg: unknown) => Promise<unknown>, ensure: () => Promise<void>): GradescopeParser {
  const call = async <T>(msg: Record<string, unknown>): Promise<T> => {
    await ensure();
    const reply = (await send({ target: 'offscreen', ...msg })) as OffscreenReply | undefined;
    if (!reply) throw new Error('offscreen document did not answer');
    if ('error' in reply) {
      if (reply.errorName === 'GradescopeParseError') throw new GradescopeParseError(reply.error);
      if (reply.errorName === 'PearsonParseError') throw new PearsonParseError(reply.error);
      throw new Error(reply.error);
    }
    return reply.data as T;
  };
  return {
    home: (html) => call({ kind: 'home', html }),
    course: (html, courseId) => call({ kind: 'course', html, courseId }),
  };
}

let creating: Promise<void> | null = null;

/** Creates the offscreen document once; later calls are no-ops. */
export async function ensureOffscreenDocument(): Promise<void> {
  const url = browser.runtime.getURL('/offscreen.html');
  const existing = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({ url, reasons: [browser.offscreen.Reason.DOM_PARSER], justification: 'Parse Gradescope pages into assignments' })
    .finally(() => {
      creating = null;
    });
  await creating;
}

export const offscreenParser: GradescopeParser = createProxyParser((m) => browser.runtime.sendMessage(m), ensureOffscreenDocument);

/** Pearson page parsing for the service worker, through the same offscreen document. */
export async function offscreenParsePearson(html: string): Promise<PearsonPage> {
  await ensureOffscreenDocument();
  const reply = (await browser.runtime.sendMessage({ target: 'offscreen', kind: 'pearson', html })) as OffscreenReply | undefined;
  if (!reply) throw new Error('offscreen document did not answer');
  if ('error' in reply) throw reply.errorName === 'PearsonParseError' ? new PearsonParseError(reply.error) : new Error(reply.error);
  return reply.data as PearsonPage;
}
