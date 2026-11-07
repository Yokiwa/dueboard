/** US zone abbreviations Wiley prints after due times, as hours from UTC. */
const ZONES: Record<string, number> = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, UTC: 0, GMT: 0 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DUE = /^\s*Due\s+(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*\(([A-Z]{2,4})\))?/i;

/**
 * "Due Monday, Nov 9 at 11:59 PM (EST)" → ISO. Wiley omits the year, so the one closest to `now` is used.
 * Returns null for any other text.
 */
export function parseDueText(text: string, now: Date): string | null {
  const m = text.match(DUE);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const day = Number(m[2]);
  const hour = (Number(m[4]) % 12) + (m[6]!.toUpperCase() === 'PM' ? 12 : 0);
  const minute = Number(m[5]);
  const zone = m[7] ? ZONES[m[7].toUpperCase()] : undefined;
  const at = (year: number) =>
    zone === undefined ? new Date(year, month, day, hour, minute).getTime() : Date.UTC(year, month, day, hour, minute) - zone * 3_600_000;
  const years = m[3] ? [Number(m[3])] : [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const best = years.map(at).sort((a, b) => Math.abs(a - now.getTime()) - Math.abs(b - now.getTime()))[0]!;
  return new Date(best).toISOString();
}

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
