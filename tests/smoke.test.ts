import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';

describe('test environment', () => {
  beforeEach(() => fakeBrowser.reset());

  it('fake storage round-trips a value', async () => {
    await browser.storage.local.set({ a: 1 });
    const got = await browser.storage.local.get('a');
    expect(got.a).toBe(1);
  });
});
