import { describe, it, expect } from 'vitest';
import { translate, resolveLang, messages } from '../../src/ui/i18n';

describe('i18n', () => {
  it('fills variables', () => {
    expect(translate('zh', 'chips.within48', { n: 3 })).toBe('48 小时内 3 项');
    expect(translate('en', 'chips.within48', { n: 3 })).toBe('3 due in 48 h');
  });
  it('every key exists in both languages', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.zh).sort());
  });
  it('auto follows navigator language', () => {
    expect(resolveLang('auto', 'zh-CN')).toBe('zh');
    expect(resolveLang('auto', 'en-US')).toBe('en');
    expect(resolveLang('en', 'zh-CN')).toBe('en');
  });
  it('ago formatting', () => {
    const now = new Date('2026-11-04T17:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(translate('zh', 'ago', { iso: ago(20_000), now })).toBe('刚刚');
    expect(translate('zh', 'ago', { iso: ago(5 * 60_000), now })).toBe('5 分钟前');
    expect(translate('en', 'ago', { iso: ago(2 * 3600_000), now })).toBe('2 h ago');
    expect(translate('zh', 'ago', { iso: ago(3 * 86400_000), now })).toBe('3 天前');
  });
});
