import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browser } from 'wxt/browser';
import { FRAME_RULE_ID, disableFrameHeaders, enableFrameHeaders } from '../../src/visits/frame/headers';

describe('frame header rule', () => {
  const update = vi.fn(async (_o: unknown) => undefined);
  beforeEach(() => {
    update.mockClear();
    (browser as unknown as Record<string, unknown>).declarativeNetRequest = { updateSessionRules: update };
  });

  it('uses rule id 9001', () => expect(FRAME_RULE_ID).toBe(9001));

  it('enable replaces rule 9001 with one that strips embedding headers from tab-less sub-frames', async () => {
    await enableFrameHeaders();
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0] as { removeRuleIds: number[]; addRules: { id: number; action: { type: string; responseHeaders: { header: string; operation: string }[] }; condition: unknown }[] };
    expect(arg.removeRuleIds).toEqual([9001]);
    expect(arg.addRules.length).toBe(1);
    const rule = arg.addRules[0]!;
    expect(rule.id).toBe(9001);
    expect(rule.condition).toEqual({ tabIds: [-1], resourceTypes: ['sub_frame'] });
    expect(rule.action.type).toBe('modifyHeaders');
    expect(rule.action.responseHeaders).toEqual([
      { header: 'x-frame-options', operation: 'remove' },
      { header: 'content-security-policy', operation: 'remove' },
    ]);
  });

  it('disable removes rule 9001 only', async () => {
    await disableFrameHeaders();
    expect(update).toHaveBeenCalledWith({ removeRuleIds: [9001] });
  });
});
