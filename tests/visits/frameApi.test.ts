import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browser } from 'wxt/browser';
import { FRAME_RULE_ID } from '../../src/visits/frame/headers';
import { createFrameApi } from '../../src/visits/frame/api';

describe('frame api (Chrome)', () => {
  const b = browser as unknown as { runtime: Record<string, unknown>; declarativeNetRequest: unknown };
  const send = vi.fn(async (_m: unknown) => true as unknown);
  const getContexts = vi.fn(async (_q: unknown) => [] as unknown[]);
  const update = vi.fn(async (_o: unknown) => undefined);
  beforeEach(async () => {
    b.declarativeNetRequest = { updateSessionRules: update };
    send.mockReset();
    send.mockImplementation(async () => true as unknown);
    getContexts.mockReset();
    getContexts.mockImplementation(async () => [] as unknown[]);
    b.runtime.sendMessage = send;
    b.runtime.getContexts = getContexts;
    b.runtime.getURL = (p: string) => `chrome-extension://abc${p}`;
    await createFrameApi().reset();
    update.mockClear();
    send.mockClear();
    getContexts.mockClear();
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

  it('begin and end are reference counted: the rule goes on at 0 to 1 and off at 1 to 0', async () => {
    const api = createFrameApi();
    const other = createFrameApi();
    await api.begin();
    await other.begin();
    expect(update).toHaveBeenCalledTimes(1);
    expect((update.mock.calls[0]![0] as { addRules: unknown[] }).addRules).toHaveLength(1);
    await api.end();
    expect(update).toHaveBeenCalledTimes(1);
    await other.end();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]![0]).toEqual({ removeRuleIds: [FRAME_RULE_ID] });
    await other.end();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('reset clears the count and disables the rule', async () => {
    const api = createFrameApi();
    await api.begin();
    await api.begin();
    update.mockClear();
    await api.reset();
    expect(update).toHaveBeenCalledWith({ removeRuleIds: [FRAME_RULE_ID] });
    update.mockClear();
    await api.begin();
    expect(update).toHaveBeenCalledTimes(1);
    expect((update.mock.calls[0]![0] as { addRules: unknown[] }).addRules).toHaveLength(1);
  });

  it('visit resolves blocked when the message to the frame host rejects', async () => {
    getContexts.mockResolvedValue([{}]);
    send.mockRejectedValue(new Error('Receiving end does not exist'));
    const r = await createFrameApi().visit({ token: 't', url: 'https://x.test/', mode: 'due' });
    expect(r).toEqual({ status: 'blocked', listed: [], frames: [], clicked: [], pages: [] });
  });
});
