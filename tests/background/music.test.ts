import { describe, expect, it } from 'vitest';
import { parseMusicAction } from '../../src/background/music';

describe('music background messages', () => {
  it('accepts supported player actions', () => {
    expect(parseMusicAction({ action: 'play', trackId: 'rain' })).toEqual({ action: 'play', trackId: 'rain' });
    expect(parseMusicAction({ action: 'pause' })).toEqual({ action: 'pause' });
    expect(parseMusicAction({ action: 'volume', volume: 0.4 })).toEqual({ action: 'volume', volume: 0.4 });
  });

  it('rejects malformed actions', () => {
    expect(parseMusicAction({ action: 'play' })).toBeNull();
    expect(parseMusicAction({ action: 'volume', volume: 'loud' })).toBeNull();
    expect(parseMusicAction({ action: 'delete' })).toBeNull();
  });
});
