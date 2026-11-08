/**
 * The one kind of button DueBoard may press on a platform page: "open the assignment" (Open, Launch, View
 * assignment, Go to assignment). Anything that could start, continue or submit work is never pressed, and long
 * labels are skipped (they are instructions, not buttons).
 */
const OPEN = /\b(open|launch)\b|^(view|go to) (the )?(assignment|assessment|activity|homework|course)\b/i;
const NEVER = /\b(start|begin|submit|attempt|take|resume|retake|retry|continue|delete|remove|reset|upload|save|drop|withdraw|sign ?out|log ?out|purchase|buy|pay|grade|unsubmit)\b/i;
const MAX_LABEL = 40;

export interface OpenButton {
  label: string;
  /** Presses it; a link or form meant for a new tab opens here instead (this is DueBoard's own hidden tab). */
  press(): void;
}

function hidden(el: Element): boolean {
  if (el.closest('[hidden],[aria-hidden="true"]')) return true;
  const style = (el as HTMLElement).style;
  return Boolean(style && (style.display === 'none' || style.visibility === 'hidden'));
}

function labelOf(el: Element): string {
  const raw = el.getAttribute('aria-label') || (el as HTMLInputElement).value || el.textContent || '';
  return raw.replace(/\s+/g, ' ').trim();
}

export function openButton(doc: Document): OpenButton | null {
  const candidates = Array.from(doc.querySelectorAll('button, a[href], [role="button"], input[type="button"]'));
  for (const el of candidates) {
    if (hidden(el) || (el as HTMLButtonElement).disabled) continue;
    const label = labelOf(el);
    if (!label || label.length > MAX_LABEL || !OPEN.test(label) || NEVER.test(label)) continue;
    return {
      label,
      press() {
        if (el instanceof HTMLAnchorElement) el.setAttribute('target', '_self');
        const form = el.closest('form');
        if (form) form.setAttribute('target', '_self');
        (el as HTMLElement).click();
      },
    };
  }
  return null;
}
