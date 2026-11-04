const CODE = /\b([A-Za-z]{2,5})\s?(\d{3,5})\b/;

/** "CS 18000-LEC Fall 2026" → "CS 18000"; "MA 261" → "MA 26100" (Purdue moved to 5-digit numbers). */
export function extractCourseCode(name: string): string | null {
  for (const m of name.matchAll(new RegExp(CODE, 'g'))) {
    const [, subject, num] = m as unknown as [string, string, string];
    if (num.length === 4) continue; // years like "Fall 2026"
    return `${subject.toUpperCase()} ${num.length === 3 ? `${num}00` : num}`;
  }
  return null;
}

/** "Project 3 - Due" → "Project 3": removes the marker Brightspace adds to calendar due events. */
export function stripDueSuffix(title: string): string {
  return title.replace(/[\s\-(]*\(?\s*due\s*\)?\s*$/i, '').trim();
}

/** Lowercase, drop a trailing "due" marker, keep only letters and digits (any script). */
export function normalizeTitle(title: string): string {
  return stripDueSuffix(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}
