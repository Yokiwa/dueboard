import { describe, it, expect, vi } from 'vitest';
import { withKeepAlive } from '../../src/sync/keepAlive';

describe('withKeepAlive', () => {
  it('pings while the work runs and stops afterwards', async () => {
    vi.useFakeTimers();
    const ping = vi.fn(async () => {});
    let finish: (v: string) => void = () => {};
    const p = withKeepAlive(new Promise<string>((r) => (finish = r)), ping, 20_000);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(ping).toHaveBeenCalledTimes(2);
    finish('done');
    await expect(p).resolves.toBe('done');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ping).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
