import { SESSION_HOSTS } from '../hosts';

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

const CLICKABLE = 'button, a[href], [role="button"], [role="link"], input[type="button"]';

function pressable(el: Element, label: string): OpenButton {
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

export function openButton(doc: Document): OpenButton | null {
  for (const el of Array.from(doc.querySelectorAll(CLICKABLE))) {
    if (hidden(el) || (el as HTMLButtonElement).disabled) continue;
    const label = labelOf(el);
    if (!label || label.length > MAX_LABEL || !OPEN.test(label) || NEVER.test(label)) continue;
    return pressable(el, label);
  }
  return null;
}

/**
 * The step a platform's sign-in through Brightspace needs on the way to the site DueBoard reads. Pearson's Brightspace
 * page ("Access Pearson for D2L Brightspace") signs the student in to MyLab only when its Assignments link is opened.
 * Exact labels only.
 */
const SESSION_STEPS: Partial<Record<string, RegExp>> = { pearson: /^assignments\b(?!\s+\w)|^assignments\b[\s,(–-]+opens? in/i };

/** On a sign-in visit's page (not on the session host itself): the link to press, if the page shows it. */
export function sessionStep(doc: Document, platform: string | undefined, pageHost: string): OpenButton | null {
  const label = platform ? SESSION_STEPS[platform] : undefined;
  if (!label || !platform || pageHost === SESSION_HOSTS[platform]) return null;
  for (const el of Array.from(doc.querySelectorAll(CLICKABLE))) {
    if (hidden(el) || (el as HTMLButtonElement).disabled) continue;
    // Its text or its accessible name ("Assignments, opens in a new window").
    const texts = [labelOf(el), (el.textContent ?? '').replace(/\s+/g, ' ').trim()];
    const text = texts.find((s) => s.length <= MAX_LABEL && label.test(s));
    if (text) return pressable(el, text);
  }
  return null;
}

/** The labels of the page's visible buttons and links (up to 8), for the visit log. */
export function buttonLabels(doc: Document): string[] {
  const out: string[] = [];
  for (const el of Array.from(doc.querySelectorAll('button, a[href], [role="button"], input[type="button"], input[type="submit"]'))) {
    if (hidden(el)) continue;
    const label = labelOf(el);
    if (label && label.length <= MAX_LABEL && !out.includes(label)) out.push(label);
    if (out.length >= 8) break;
  }
  return out;
}
