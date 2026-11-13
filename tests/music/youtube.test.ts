import { describe, expect, it } from 'vitest';
import { parseYouTubeMusicUrl } from '../../src/music/youtube';

describe('YouTube Music links', () => {
  it('converts a YouTube Music song into an official embed URL', () => {
    const result = parseYouTubeMusicUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toMatchObject({ kind: 'video' });
    expect(result?.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1');
  });

  it('keeps the playlist when a YouTube Music link includes a song and list', () => {
    const result = parseYouTubeMusicUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890');
    expect(result).toMatchObject({ kind: 'playlist' });
    expect(result?.embedUrl).toContain('/embed/dQw4w9WgXcQ?');
    expect(result?.embedUrl).toContain('listType=playlist');
    expect(result?.embedUrl).toContain('list=PL1234567890');
  });

  it('supports playlist-only and short YouTube links', () => {
    expect(parseYouTubeMusicUrl('https://music.youtube.com/playlist?list=PL1234567890')?.embedUrl).toContain('list=PL1234567890');
    expect(parseYouTubeMusicUrl('https://youtu.be/dQw4w9WgXcQ')?.kind).toBe('video');
  });

  it('rejects unsupported sites and malformed IDs', () => {
    expect(parseYouTubeMusicUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeMusicUrl('https://music.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeMusicUrl('javascript:alert(1)')).toBeNull();
  });
});
