import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = noComments(readFileSync('src/entrypoints/dashboard/dashboard.css', 'utf8'));
const tokens = noComments(readFileSync('src/ui/tokens.css', 'utf8'));
/** The declarations of every rule whose selector list is exactly `selector`. */
const rules = (source: string, selector: string) =>
  [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === selector).map((m) => m[2]!);

describe('dashboard styles', () => {
  it('the sidebar logo keeps the theme accent (BrandMark): no rule paints it in the text color', () => {
    for (const sel of ['.dashboard-brand', '.dashboard-brand svg']) {
      for (const body of rules(css, sel)) expect(body, sel).not.toMatch(/(^|[;\s])color\s*:/);
    }
  });

  it('the flame has its own warm color and a flicker that stops for reduced motion', () => {
    expect(tokens).toMatch(/--color-db-flame\s*:/);
    expect(rules(tokens, '.db-flame').join(';')).toMatch(/color:\s*var\(--color-db-flame\)/);
    expect(tokens).toMatch(/@keyframes db-flicker/);
    expect(tokens).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.db-flame[\s\S]*animation:\s*none/);
  });
});
