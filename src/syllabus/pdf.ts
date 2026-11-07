/**
 * Turns a PDF into text lines with Mozilla's pdf.js, loaded only when a PDF is read. Text pieces on the same
 * baseline join into one line; lines come in reading order (top to bottom, page by page).
 */
export async function pdfToLines(bytes: ArrayBuffer, opts: { workerSrc?: string } = {}): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs');
  if (opts.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc;
  // Text only: no fonts are rendered, so missing standard-font data is irrelevant (verbosity 0 hides that warning).
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const lines: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
        rows.set(key, [...(rows.get(key) ?? []), { x: item.transform[4], s: item.str }]);
      }
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        const text = rows.get(y)!.sort((a, b) => a.x - b.x).map((r) => r.s).join(' ').replace(/\s+/g, ' ').trim();
        if (text) lines.push(text);
      }
    }
  } finally {
    await task.destroy();
  }
  return lines;
}
