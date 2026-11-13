import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pearsonSessionPage } from '../../src/connectors/pearson/sessionPage';
import { parsePearson } from '../../src/connectors/pearson/parse';

const page = readFileSync('tests/fixtures/pearson/assignments.html', 'utf8');
describe('minimal Pearson session snapshot', () => {
  it('preserves course, item identities and every due date without keeping tokens or scripts', () => {
    const doc = new DOMParser().parseFromString(page, 'text/html');
    doc.body.insertAdjacentHTML('beforeend', '<input name="__VIEWSTATE" value="SECRET_TOKEN"><script>const password="SECRET_PASSWORD"</script>');
    const link = doc.querySelector('th[scope="row"] a')!;
    link.setAttribute('onclick', 'secretCallback("SECRET_EVENT")');
    const html = pearsonSessionPage(doc)!;
    expect(html).toBeTruthy();
    expect(html).not.toMatch(/SECRET_|<script|<input|onclick/);
    const original = parsePearson(page);
    const restored = parsePearson(html);
    expect(restored.courseId).toBe(original.courseId);
    expect(restored.items).toEqual(original.items);
    expect(restored.form).toEqual({});
  });
  it('rejects a table that is still loading and accepts an explicitly empty assignment list', () => {
    document.body.innerHTML = '<table class="assignement-list-table"><tr><td>Loading…</td></tr></table>';
    expect(pearsonSessionPage(document)).toBeNull();
    expect(() => parsePearson(document.documentElement.outerHTML)).toThrow(/still loading/);
    document.body.innerHTML = '<table class="assignement-list-table"><tr><td>No assignments</td></tr></table>';
    expect(parsePearson(pearsonSessionPage(document)!).items).toEqual([]);
  });
});
