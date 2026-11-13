import { browser } from 'wxt/browser';
import { domGradescopeParser, GradescopeParseError, type GradescopeParser } from '../connectors/gradescope/parse';
import { parsePearson, PearsonParseError, type PearsonPage } from '../connectors/pearson/parse';
import type { LineReaders } from '../syllabus/read';

export type OffscreenReply = { data: unknown } | { error: string; errorName: string };

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

function toBase64(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
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

/** Whether the offscreen document is open now (asking does not create it). */
export async function offscreenDocumentExists(): Promise<boolean> {
  const existing = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [browser.runtime.getURL('/offscreen.html')],
  });
  return existing.length > 0;
}

/**
 * Creates the offscreen document once; later calls are no-ops. A document an older version created with fewer reasons
 * keeps working and is left alone.
 */
export async function ensureOffscreenDocument(): Promise<void> {
  const url = browser.runtime.getURL('/offscreen.html');
  if (await offscreenDocumentExists()) return;
  creating ??= browser.offscreen
    .createDocument({
      url,
      reasons: [browser.offscreen.Reason.DOM_PARSER, browser.offscreen.Reason.WORKERS, browser.offscreen.Reason.DOM_SCRAPING, browser.offscreen.Reason.AUDIO_PLAYBACK],
      justification:
        "Parse course pages, read due dates from the student's assignment pages, and play the Pomodoro completion cue",
    })
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

async function askOffscreen(msg: Record<string, unknown>): Promise<string[]> {
  await ensureOffscreenDocument();
  const reply = (await browser.runtime.sendMessage({ target: 'offscreen', ...msg })) as OffscreenReply | undefined;
  if (!reply || 'error' in reply) return [];
  return reply.data as string[];
}

/** Syllabus readers for Chrome's service worker; files travel to the offscreen document (PDF bytes as base64). */
export const offscreenSyllabusReaders: LineReaders = {
  html: (text) => askOffscreen({ kind: 'syllabusHtml', html: text }),
  pdf: (bytes) => askOffscreen({ kind: 'syllabusPdf', base64: toBase64(bytes) }),
};
