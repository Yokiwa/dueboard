import { browser } from 'wxt/browser';
import { IS_FIREFOX } from '../core/env';
import { handleMusicControl, type MusicAction } from '../music/player';
import { ensureOffscreenDocument } from '../sync/offscreenParser';

export function parseMusicAction(message: Record<string, unknown>): MusicAction | null {
  if (message.action === 'play' && typeof message.trackId === 'string') return { action: 'play', trackId: message.trackId };
  if (message.action === 'pause') return { action: 'pause' };
  if (message.action === 'volume' && typeof message.volume === 'number' && Number.isFinite(message.volume)) {
    return { action: 'volume', volume: message.volume };
  }
  return null;
}

export async function controlMusic(action: MusicAction): Promise<boolean> {
  if (IS_FIREFOX) return handleMusicControl(action);
  await ensureOffscreenDocument();
  return browser.runtime.sendMessage({ target: 'offscreen', kind: 'musicControl', ...action }) as Promise<boolean>;
}
