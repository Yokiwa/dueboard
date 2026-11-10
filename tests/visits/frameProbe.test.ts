import { describe, it, expect } from 'vitest';
import { isOwnPageSender } from '../../src/visits/frame/probe';
import { createRouter } from '../../src/background/router';

const EXT = 'chrome-extension://abc123/';

describe('frameProbe sender check', () => {
  it('accepts the extension\'s own pages', () => {
    expect(isOwnPageSender({ url: `${EXT}dashboard.html` }, EXT)).toBe(true);
    expect(isOwnPageSender({ url: `${EXT}offscreen.html`, origin: 'chrome-extension://abc123' }, EXT)).toBe(true);
  });
  it('rejects websites, other extensions, content scripts and missing senders', () => {
    expect(isOwnPageSender({ url: 'https://www.aleks.com/x' }, EXT)).toBe(false);
    expect(isOwnPageSender({ url: 'chrome-extension://abc1234/x.html' }, EXT)).toBe(false);
    expect(isOwnPageSender({ url: `${EXT}x.html`, origin: 'https://evil.example' }, EXT)).toBe(false);
    expect(isOwnPageSender({ origin: 'chrome-extension://abc123' }, EXT)).toBe(false);
    expect(isOwnPageSender(undefined, EXT)).toBe(false);
    expect(isOwnPageSender({ url: `${EXT}x.html` }, '')).toBe(false);
  });
});

describe('background router and frame reader messages', () => {
  it('returns undefined for frameConfig and frameMessage (the frame host answers them)', () => {
    const route = createRouter({ probe: async () => 'x', visitFound: async () => true });
    const nonce = 'a'.repeat(32);
    expect(route({ type: 'frameConfig', nonce }, { url: 'https://www.aleks.com/x' })).toBeUndefined();
    expect(route({ type: 'frameMessage', nonce, message: { type: 'visitFound' } }, { url: 'https://www.aleks.com/x' })).toBeUndefined();
  });
});
