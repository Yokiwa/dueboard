import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../../src/background/router';

describe('background message router', () => {
  it('dispatches by message type and returns the handler result', async () => {
    const route = createRouter({ probe: vi.fn(async () => 'probed') });
    await expect(route({ type: 'probe' })).resolves.toBe('probed');
  });

  it('returns undefined for unknown or non-object messages', async () => {
    const route = createRouter({ probe: async () => 'x' });
    expect(route({ type: 'nope' })).toBeUndefined();
    expect(route('probe')).toBeUndefined();
    expect(route({ target: 'offscreen', type: 'probe' })).toBeUndefined();
  });
});

describe('router passes the sender', () => {
  it('handlers receive who sent the message', async () => {
    const route = createRouter({ captureDue: async (_m, sender) => sender?.url });
    await expect(route({ type: 'captureDue' }, { url: 'https://education.wiley.com/x' })).resolves.toBe('https://education.wiley.com/x');
  });
});
