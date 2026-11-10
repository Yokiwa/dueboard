import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browser } from 'wxt/browser';
import { createFrameApi } from '../../src/visits/frame/api';

describe('frame api (Chrome)', () => {
  const b = browser as unknown as { runtime: Record<string, unknown> };
  const send = vi.fn(async (_m: unknown) => true as unknown);
  const getContexts = vi.fn(async (_q: unknown) => [] as unknown[]);
  beforeEach(() => {
    send.mockClear();
    getContexts.mockClear();
    b.runtime.sendMessage = send;
    b.runtime.getContexts = getContexts;
    b.runtime.getURL = (p: string) => `chrome-extension://abc${p}`;
  });

  it('reset does nothing, and creates nothing, when there is no offscreen document', async () => {
    await createFrameApi().reset();
    expect(getContexts).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('reset tells an existing offscreen document to clear its frames', async () => {
    getContexts.mockResolvedValueOnce([{}]);
    await createFrameApi().reset();
    expect(send).toHaveBeenCalledWith({ target: 'offscreen', kind: 'frameReset' });
  });
});
