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

describe('alert banners in every dashboard theme', () => {
  /** `--name: value` declarations of a block, later ones winning. */
  const decls = (body: string) =>
    Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  const block = (source: string, selector: string) => decls(rules(source, selector).join(';'));
  const lightTokens = decls(/@theme\s*\{([^{}]*)\}/.exec(tokens)![1]!);
  const darkTokens = block(tokens, ':root');
  const themed = block(css, '.dueboard-themed');
  const themes = ['morning-dew', 'noon-cafe', 'dusk-lullaby', 'nightowl'];

  const resolve = (vars: Record<string, string>, name: string): string => {
    const v = vars[name];
    expect(v, name).toBeDefined();
    const ref = /^var\((--[\w-]+)\)$/.exec(v!);
    return ref ? resolve(vars, ref[1]!) : v!;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  for (const theme of themes) {
    for (const [mode, system] of [['light', lightTokens], ['dark', { ...lightTokens, ...darkTokens }]] as const) {
      it(`${theme} theme, ${mode} system mode: banner text is readable on the banner background`, () => {
        const vars = { ...system, ...themed, ...block(css, `.dueboard-themed[data-theme='${theme}']`) };
        const fg = resolve(vars, '--color-db-urgent-fg');
        const bg = resolve(vars, '--color-db-alert-bg');
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
