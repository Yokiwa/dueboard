import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = noComments(readFileSync('src/entrypoints/dashboard/dashboard.css', 'utf8'));
const tokens = noComments(readFileSync('src/ui/tokens.css', 'utf8'));
/** The declarations of every rule whose selector list is exactly `selector`. */
const rules = (source: string, selector: string) =>
  [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === selector).map((m) => m[2]!);

describe('dashboard styles', () => {
  it('no dashboard rule paints a color over the sidebar logo', () => {
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

describe('BrandMark', () => {
  it('uses the extension icon colors (src/assets/icon.svg) in every theme, not the theme accent', async () => {
    const { render } = await import('@testing-library/react');
    const { createElement } = await import('react');
    const { BrandMark } = await import('../../src/ui/components/BrandMark');
    const icon = readFileSync('src/assets/icon.svg', 'utf8');
    const iconFill = /<rect[^>]*fill="([^"]+)"/.exec(icon)![1]!.toLowerCase();
    const iconStroke = /<path[^>]*stroke="([^"]+)"/.exec(icon)![1]!.toLowerCase();
    const { container } = render(createElement(BrandMark));
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('rect')!.getAttribute('fill')!.toLowerCase()).toBe(iconFill);
    expect(svg.querySelector('path')!.getAttribute('stroke')!.toLowerCase()).toBe(iconStroke);
    expect(svg.getAttribute('class') ?? '').not.toMatch(/text-db-accent/);
  });
});
