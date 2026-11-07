import { parseDueText } from '../core/dueText';
import { findDueWiley } from '../visits/finders/wiley';

export { parseDueText };

export interface CapturedDue {
  title: string;
  dueAt: string;
}

/** The assignment title (page heading) and its due date, once both are rendered. */
export function extractWileyDue(doc: Document, now: Date): CapturedDue | null {
  const found = findDueWiley(doc, now);
  return found ? { title: found.title, dueAt: found.dueAt } : null;
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
