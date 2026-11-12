import { isZero } from '../../core/completion';
import { findScore } from '../../core/scoreText';
import type { CheckAnswer } from '../../core/types';
import { pageLines } from './lines';

/** A status of its own (a badge, a label's value): at most this many words. */
const MAX_WORDS = 4;
const DONE = /^(?:status:\s*)?(submitted|completed|turned in|graded)\.?$/i;
const NOT_DONE = /^(?:status:\s*)?(not submitted|not started|no submission|not attempted|not turned in)\.?$/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Filters, tabs, menus, links and column headers name statuses without being this work's status. */
const NOT_A_STATUS = 'a, button, nav, select, option, th, [role="tab"], [role="tablist"], [role="menu"], [role="menuitem"], [role="navigation"], [role="button"], [role="link"], script, style, noscript, template';

function hidden(el: Element): boolean {
  if (el.closest('[hidden],[aria-hidden="true"]')) return true;
  const style = (el as HTMLElement).style;
  return Boolean(style && (style.display === 'none' || style.visibility === 'hidden'));
}

/** An element's visible text, leaving out hidden parts and controls (whose words are not a status). */
function statusText(el: Element): string {
  let out = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) out += n.textContent ?? '';
    else if (n.nodeType === 1 && !hidden(n as Element) && !(n as Element).matches(NOT_A_STATUS)) out += ` ${statusText(n as Element)} `;
  }
  return out;
}

/** The status words the page shows on their own, innermost element per word. */
function statuses(doc: Document): { state: 'done' | 'not_done'; text: string }[] {
  const out: { state: 'done' | 'not_done'; text: string; el: Element }[] = [];
  for (const el of Array.from(doc.body?.querySelectorAll('*') ?? [])) {
    if (hidden(el) || el.closest(NOT_A_STATUS)) continue;
    const text = clean(statusText(el));
    if (!text || text.split(' ').length > MAX_WORDS) continue;
    const state = NOT_DONE.test(text) ? 'not_done' : DONE.test(text) ? 'done' : null;
    if (!state) continue;
    // A parent repeating its child's words is the same status, counted once.
    const i = out.findIndex((o) => el.contains(o.el) || o.el.contains(el));
    if (i >= 0) continue;
    out.push({ state, text, el });
  }
  return out.map(({ state, text }) => ({ state, text }));
}

/**
 * Whether the page shows the work handed in: a labeled score (findScore), or a status word of its own. Strict: a page
 * that lists several statuses, or disagrees with itself, gives no answer; a zero score counts only next to a status.
 */
export function findCompletion(doc: Document, from: string, now: Date = new Date()): CheckAnswer | null {
  const found = statuses(doc);
  // More than two status badges, or both kinds: a list of assignments, not one.
  const kinds = new Set(found.map((f) => f.state));
  const status = found.length > 0 && found.length <= 2 && kinds.size === 1 ? found[0]! : null;
  const score = findScore(pageLines(doc), from, now);
  if (score && !isZero(score)) return { state: 'done', by: 'score', source: from, score, ...(score.evidence ? { evidence: score.evidence } : {}) };
  if (score && status?.state === 'done') return { state: 'done', by: 'score', source: from, score, evidence: status.text };
  if (!status) return null;
  return status.state === 'done' ? { state: 'done', by: 'submitted', source: from, evidence: status.text } : { state: 'not_done', source: from, evidence: status.text };
}
