/** Keep the session reader and the HTML parser on the same assignment-table layouts. */
export const PEARSON_TABLE = 'table[id$="gridAssignments"], table.assignement-list-table';
export const MAX_SESSION_HTML = 1_000_000;

/**
 * A minimal, transient copy of the rendered assignment list. No page scripts, cookies or WebForms tokens are sent.
 * A loading shell is not a successful session; wait for assignment rows or an explicit empty-list message.
 */
export function pearsonSessionPage(doc: Document): string | null {
  const table = doc.querySelector(PEARSON_TABLE);
  if (!table || (!table.querySelector('th[scope="row"]') && !/\bno assignments\b/i.test(table.textContent ?? ''))) return null;
  const copy = table.cloneNode(true) as Element;
  copy.querySelectorAll('script, style, input, select, textarea, iframe').forEach((el) => el.remove());
  for (const el of [copy, ...copy.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (!['id', 'class', 'scope', 'href', 'title'].includes(attr.name)) el.removeAttribute(attr.name);
    }
    if (el.hasAttribute('href')) {
      const action = el.getAttribute('href')?.match(/^javascript:(do\w+)\((\d+)/);
      if (action) el.setAttribute('href', `javascript:${action[1]}(${action[2]})`);
      else el.removeAttribute('href');
    }
  }
  const course = doc.documentElement.outerHTML.match(/courseId\s*['"]?\s*:\s*['"](\d+)['"]/)?.[1];
  const html = `${course ? `<!-- courseId: '${course}' -->` : ''}${copy.outerHTML}`;
  return html.length <= MAX_SESSION_HTML ? html : null;
}
