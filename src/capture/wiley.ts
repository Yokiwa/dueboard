import { parseDueText } from '../core/dueText';

export { parseDueText };

export interface CapturedDue {
  title: string;
  dueAt: string;
}

/** The assignment title (page heading) and its due date, once both are rendered. */
export function extractWileyDue(doc: Document, now: Date): CapturedDue | null {
  const title = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const dueAt = parseDueText(n.textContent ?? '', now);
    if (dueAt) return { title, dueAt };
  }
  return null;
}

/**
 * Wiley is a single-page app: watch the DOM and report each assignment's due date once it appears
 * (again if the student moves on to another assignment). Returns a function that stops watching.
 */
export function watchForWileyDue(doc: Document, onFound: (c: CapturedDue) => void, now: () => Date = () => new Date()): () => void {
  let last = '';
  const check = () => {
    const found = extractWileyDue(doc, now());
    if (!found) return;
    const key = `${found.title}|${found.dueAt}`;
    if (key === last) return;
    last = key;
    onFound(found);
  };
  check();
  const observer = new MutationObserver(check);
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
