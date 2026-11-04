const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REDACTED = '[REDACTED]';

function activeSecrets(secrets: string[]): string[] {
  return secrets.filter((s) => s.trim().length > 0);
}

/** Recursively removes personal data from a JSON value before it is shared as a test fixture. */
export function scrubJson(value: unknown, secrets: string[]): unknown {
  const live = activeSecrets(secrets);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (live.some((s) => v.includes(s))) return REDACTED;
      return v.replace(EMAIL, 'user@example.com');
    }
    if (typeof v === 'number') return live.includes(String(v)) ? REDACTED : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, child]) => [k, walk(child)]));
    }
    return v;
  };
  return walk(value);
}

/** Removes secrets and email addresses from an HTML page. */
export function scrubHtml(html: string, secrets: string[]): string {
  let out = html;
  for (const s of activeSecrets(secrets)) out = out.split(s).join(REDACTED);
  return out.replace(EMAIL, 'user@example.com');
}
