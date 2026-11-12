import { describe, it, expect, vi } from 'vitest';
import { onBackgroundStart, type StartDeps } from '../../src/background/start';

const deps = (o: Partial<StartDeps> = {}): StartDeps & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    getVisitWindow: async () => undefined,
    closeLeftover: async (id) => void calls.push(`close ${id}`),
    setVisitProgress: async () => void calls.push('progress cleared'),
    resetFrames: async () => void calls.push('reset'),
    ...o,
  };
};

describe('onBackgroundStart', () => {
  it('clears the progress line and resets frames even when no visit window exists', async () => {
    const d = deps();
    await onBackgroundStart(d);
    expect(d.calls.sort()).toEqual(['progress cleared', 'reset']);
  });
  it('also closes a leftover visit window', async () => {
    const d = deps({ getVisitWindow: async () => 7 });
    await onBackgroundStart(d);
    expect(d.calls.sort()).toEqual(['close 7', 'progress cleared', 'reset']);
  });
  it('a failing step does not stop the others', async () => {
    const d = deps({ getVisitWindow: async () => { throw new Error('x'); }, resetFrames: vi.fn(async () => { throw new Error('y'); }) });
    await onBackgroundStart(d);
    expect(d.calls).toEqual(['progress cleared']);
  });
});
