import { pageLines } from '../visits/finders/lines';
import { pdfToLines } from '../syllabus/pdf';
import { PDF_WORKER_PATH } from '../syllabus/pdfWorker';
import type { LineReaders } from '../syllabus/read';
import type { OffscreenReply } from './offscreenParser';

// Runs where a DOM exists: Chrome's offscreen document, or Firefox's background page. Kept apart from the service
// worker's code so pdf.js never ships in Chrome's background script.

/** Syllabus HTML → lines, in a page with a DOM. */
export function htmlToLines(html: string): string[] {
  return pageLines(new DOMParser().parseFromString(html, 'text/html'));
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Pages served from inside the extension can load the bundled pdf.js worker by its path. */
const workerSrc = () => (typeof location !== 'undefined' && location.protocol.endsWith('-extension:') ? PDF_WORKER_PATH : undefined);

/** Syllabus reading in the offscreen document (async, unlike the parsers above). */
export function handleOffscreenSyllabus(msg: unknown): Promise<OffscreenReply> | undefined {
  const m = msg as { target?: string; kind?: string; html?: string; base64?: string } | null;
  if (!m || m.target !== 'offscreen') return undefined;
  const run = async (): Promise<OffscreenReply> => {
    try {
      if (m.kind === 'syllabusHtml') return { data: htmlToLines(m.html ?? '') };
      return { data: await pdfToLines(fromBase64(m.base64 ?? ''), { workerSrc: workerSrc() }) };
    } catch (e) {
      return { error: (e as Error).message, errorName: (e as Error).name };
    }
  };
  if (m.kind === 'syllabusHtml' || m.kind === 'syllabusPdf') return run();
  return undefined;
}


/** Firefox's background page has a DOM and can run pdf.js itself. */
export const inPlaceSyllabusReaders: LineReaders = {
  html: async (text) => htmlToLines(text),
  pdf: (bytes) => pdfToLines(bytes, { workerSrc: workerSrc() }),
};
