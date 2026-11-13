export interface YouTubeEmbed {
  sourceUrl: string;
  embedUrl: string;
  kind: 'video' | 'playlist';
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com']);

/** Converts a YouTube or YouTube Music song/playlist URL into a safe official embed URL. */
export function parseYouTubeMusicUrl(input: string): YouTubeEmbed | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2] ?? null;
  } else {
    return null;
  }

  const playlistId = url.searchParams.get('list');
  const video = videoId && VIDEO_ID.test(videoId) ? videoId : null;
  const playlist = playlistId && PLAYLIST_ID.test(playlistId) ? playlistId : null;
  if (!video && !playlist) return null;

  const embed = new URL(video ? `https://www.youtube.com/embed/${video}` : 'https://www.youtube.com/embed');
  if (playlist) {
    embed.searchParams.set('listType', 'playlist');
    embed.searchParams.set('list', playlist);
  }
  embed.searchParams.set('playsinline', '1');
  return {
    sourceUrl: url.toString(),
    embedUrl: embed.toString(),
    kind: playlist ? 'playlist' : 'video',
  };
}
