import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_STATE, normalizeMusicState } from '../../src/music/state';

describe('music state', () => {
  it('uses safe defaults for missing or invalid saved data', () => {
    expect(normalizeMusicState(null)).toEqual(DEFAULT_MUSIC_STATE);
    expect(normalizeMusicState({ currentId: 'missing', volume: 3, playing: true })).toMatchObject({ currentId: 'rain', volume: 1, playing: true });
  });

  it('keeps an uploaded track selected and clamps volume', () => {
    const uploaded = [{ id: 'song-1', name: 'Study mix', size: 42, type: 'audio/mp3' }];
    expect(normalizeMusicState({ currentId: 'song-1', volume: -1, uploaded })).toEqual({
      currentId: 'song-1', volume: 0, playing: false, uploaded, youtubeUrl: null,
    });
  });
});
