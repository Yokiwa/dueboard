import { describe, expect, it } from 'vitest';
import { automaticTheme } from '../../src/entrypoints/dashboard/App';

describe('automatic dashboard theme', () => {
  const at = (hour: number) => new Date(2026, 10, 13, hour, 0, 0);

  it('uses the study palette for each part of the day', () => {
    expect(automaticTheme(at(5))).toBe('morning-dew');
    expect(automaticTheme(at(12))).toBe('noon-cafe');
    expect(automaticTheme(at(18))).toBe('dusk-lullaby');
    expect(automaticTheme(at(23))).toBe('nightowl');
    expect(automaticTheme(at(2))).toBe('nightowl');
  });
});
