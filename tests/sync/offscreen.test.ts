import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleOffscreenMessage, createProxyParser } from '../../src/sync/offscreenParser';
import { GradescopeParseError } from '../../src/connectors/gradescope/parse';

const home = readFileSync('tests/fixtures/gradescope/home.html', 'utf8');

describe('handleOffscreenMessage', () => {
  it('ignores messages not addressed to the offscreen page', () => {
    expect(handleOffscreenMessage({ type: 'sync' })).toBeUndefined();
  });
  it('parses home html', () => {
    const r = handleOffscreenMessage({ target: 'offscreen', kind: 'home', html: home });
    expect(r && 'data' in r && Array.isArray(r.data) && r.data.length).toBe(2);
  });
  it('returns the error name so the caller can rethrow the right type', () => {
    expect(handleOffscreenMessage({ target: 'offscreen', kind: 'home', html: '<p></p>' })).toMatchObject({ errorName: 'GradescopeParseError' });
  });
});

describe('createProxyParser', () => {
  it('ensures the document exists, then forwards and unwraps data', async () => {
    const ensure = vi.fn(async () => {});
    const send = vi.fn(async (msg: unknown) => handleOffscreenMessage(msg));
    const p = createProxyParser(send, ensure);
    await expect(p.home(home)).resolves.toHaveLength(2);
    expect(ensure).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ target: 'offscreen', kind: 'home', html: home });
  });
  it('rethrows GradescopeParseError', async () => {
    const p = createProxyParser(async (m) => handleOffscreenMessage(m), async () => {});
    await expect(p.course('<p></p>', '1')).rejects.toBeInstanceOf(GradescopeParseError);
  });
  it('throws when nobody answers', async () => {
    const p = createProxyParser(async () => undefined, async () => {});
    await expect(p.home('x')).rejects.toThrow(/offscreen/);
  });
});
