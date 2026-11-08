const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'HEAD']);
const BLOCK = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL', 'BR',
]);

function hiddenEl(el: Element): boolean {
  if (SKIP.has(el.tagName.toUpperCase())) return true;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  const style = (el as HTMLElement).style;
  return Boolean(style && (style.display === 'none' || style.visibility === 'hidden'));
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const isBlock = (el: Element) => BLOCK.has(el.tagName.toUpperCase());
const hasBlock = (el: Element): boolean => Array.from(el.children).some((c) => isBlock(c) || hasBlock(c));

/** Visible text, without hidden subtrees; block children are separated by spaces. */
export function visibleText(el: Element): string {
  let out = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) out += n.textContent ?? '';
    else if (n.nodeType === 1 && !hiddenEl(n as Element)) out += isBlock(n as Element) ? ` ${visibleText(n as Element)} ` : visibleText(n as Element);
  }
  return out;
}

/**
 * The page's visible text as lines, in document order: each table row is one line with its cells joined by " | ";
 * otherwise each run of text and inline elements between blocks is one line.
 */
export function pageLines(doc: Document): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = clean(s);
    if (t) out.push(t);
  };
  const walk = (el: Element) => {
    if (hiddenEl(el)) return;
    if (el.tagName.toUpperCase() === 'TR') {
      push(Array.from(el.children).filter((c) => !hiddenEl(c)).map((c) => clean(visibleText(c))).filter(Boolean).join(' | '));
      return;
    }
    let run = '';
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) run += n.textContent ?? '';
      else if (n.nodeType === 1) {
        const c = n as Element;
        if (hiddenEl(c)) continue;
        if (isBlock(c) || hasBlock(c)) {
          push(run);
          run = '';
          walk(c);
        } else run += ` ${visibleText(c)} `; // adjacent inline elements (buttons, links) stay separate words
      }
    }
    push(run);
  };
  if (doc.body) walk(doc.body);
  return out;
}

/**
 * Small blocks read as one line ("<div><div>Due:</div><div>Nov 10</div></div>" → "Due: Nov 10"), for pages that lay
 * out a label and its value as separate blocks.
 */
export function compactBlocks(doc: Document, maxLength = 160): string[] {
  const out: string[] = [];
  for (const el of Array.from(doc.body?.querySelectorAll('*') ?? [])) {
    if (!isBlock(el) || !hasBlock(el) || el.closest('[hidden],[aria-hidden="true"]')) continue;
    if (Array.from(el.querySelectorAll('*')).some((c) => SKIP.has(c.tagName.toUpperCase()))) continue;
    const t = clean(visibleText(el));
    if (t && t.length <= maxLength) out.push(t);
  }
  return out;
}

/** The page's main heading: h1, else an ARIA heading, else the document title. At most 200 characters. */
export function pageTitle(doc: Document): string {
  const pick = [doc.querySelector('h1'), doc.querySelector('[role=heading]')].find((el) => el && !hiddenEl(el) && clean(el.textContent ?? ''));
  const title = clean(pick?.textContent ?? doc.title ?? '');
  return title.slice(0, 200);
}
