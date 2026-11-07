import { describe, it, expect } from 'vitest';
import { translate } from '../../src/ui/i18n';

describe('i18n', () => {
  it('fills variables', () => {
    expect(translate('chips.within48', { n: 3 })).toBe('3 due in 48 h');
    expect(translate('header.pendingWeek', { greet: 'Good morning', n: 2 })).toBe('Good morning, 2 due this week');
  });
  it('ago formatting', () => {
    const now = new Date('2026-11-04T17:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(translate('ago', { iso: ago(20_000), now })).toBe('just now');
    expect(translate('ago', { iso: ago(5 * 60_000), now })).toBe('5 min ago');
    expect(translate('ago', { iso: ago(2 * 3600_000), now })).toBe('2 h ago');
    expect(translate('ago', { iso: ago(86400_000), now })).toBe('1 day ago');
    expect(translate('ago', { iso: ago(3 * 86400_000), now })).toBe('3 days ago');
  });
});
