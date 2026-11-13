import { browser } from 'wxt/browser';

export type AmbientTrackId = 'rain' | 'cabin';

export interface UploadedTrack {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface MusicState {
  currentId: string;
  playing: boolean;
  volume: number;
  uploaded: UploadedTrack[];
}

export const MUSIC_STATE_KEY = 'dueboardMusic';
export const DEFAULT_MUSIC_STATE: MusicState = {
  currentId: 'rain',
  playing: false,
  volume: 0.45,
  uploaded: [],
};

export function normalizeMusicState(value: unknown): MusicState {
  const saved = value && typeof value === 'object' ? value as Partial<MusicState> : {};
  const uploaded = Array.isArray(saved.uploaded)
    ? saved.uploaded.filter((track): track is UploadedTrack => Boolean(
        track && typeof track.id === 'string' && typeof track.name === 'string' &&
        typeof track.size === 'number' && typeof track.type === 'string',
      )).slice(0, 50)
    : [];
  const validIds = new Set(['rain', 'cabin', ...uploaded.map((track) => track.id)]);
  return {
    currentId: typeof saved.currentId === 'string' && validIds.has(saved.currentId) ? saved.currentId : 'rain',
    playing: saved.playing === true,
    volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume)
      ? Math.min(1, Math.max(0, saved.volume))
      : DEFAULT_MUSIC_STATE.volume,
    uploaded,
  };
}

export async function loadMusicState(): Promise<MusicState> {
  const value = await browser.storage.local.get(MUSIC_STATE_KEY) as Record<string, unknown>;
  return normalizeMusicState(value[MUSIC_STATE_KEY]);
}

export async function saveMusicState(state: MusicState): Promise<void> {
  await browser.storage.local.set({ [MUSIC_STATE_KEY]: normalizeMusicState(state) });
}

export function subscribeMusicState(listener: (state: MusicState) => void): () => void {
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[MUSIC_STATE_KEY]) listener(normalizeMusicState(changes[MUSIC_STATE_KEY].newValue));
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}
