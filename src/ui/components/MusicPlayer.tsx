import { useEffect, useId, useMemo, useState } from 'react';
import { MusicNotes, Pause, Play, SkipBack, SkipForward, Trash, UploadSimple } from '@phosphor-icons/react';
import { addMusicFiles, deleteMusicFiles } from '../../music/library';
import { DEFAULT_MUSIC_STATE, loadMusicState, saveMusicState, subscribeMusicState, type MusicState } from '../../music/state';
import { primaryBtn, secondaryBtn } from '../forms';
import { useT } from '../i18n';
import { sendToBackground } from '../messaging';

export function MusicPlayer({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const headingId = useId();
  const [state, setState] = useState<MusicState>(DEFAULT_MUSIC_STATE);
  const [error, setError] = useState(false);
  const tracks = useMemo(() => [
    { id: 'rain', name: t('music.rain') },
    { id: 'cabin', name: t('music.cabin') },
    ...state.uploaded.map((track) => ({ id: track.id, name: track.name })),
  ], [state.uploaded, t]);

  useEffect(() => {
    let active = true;
    void loadMusicState().then((saved) => active && setState(saved));
    const unsubscribe = subscribeMusicState(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const send = async (message: Record<string, unknown>) => {
    setError(false);
    try {
      const ok = await sendToBackground<boolean>({ type: 'musicControl', ...message });
      if (!ok) setError(true);
    } catch {
      setError(true);
    }
  };

  const pick = async (trackId: string) => {
    const next = { ...state, currentId: trackId };
    setState(next);
    await saveMusicState(next);
    if (state.playing) await send({ action: 'play', trackId });
  };

  const step = (direction: -1 | 1) => {
    const index = Math.max(0, tracks.findIndex((track) => track.id === state.currentId));
    const track = tracks[(index + direction + tracks.length) % tracks.length];
    if (track) void pick(track.id);
  };

  const toggle = () => {
    setState((current) => ({ ...current, playing: !current.playing }));
    void send(state.playing ? { action: 'pause' } : { action: 'play', trackId: state.currentId });
  };

  const volume = (value: number) => {
    const next = { ...state, volume: value };
    setState(next);
    void saveMusicState(next);
    void send({ action: 'volume', volume: value });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(false);
    try {
      const added = await addMusicFiles(Array.from(files));
      if (added.length === 0) {
        setError(true);
        return;
      }
      const next = { ...state, uploaded: [...state.uploaded, ...added].slice(0, 50) };
      setState(next);
      await saveMusicState(next);
    } catch {
      setError(true);
    }
  };

  const clearUploads = async () => {
    const ids = state.uploaded.map((track) => track.id);
    if (ids.length === 0) return;
    if (ids.includes(state.currentId) && state.playing) await send({ action: 'pause' });
    await deleteMusicFiles(ids);
    const next = { ...state, currentId: ids.includes(state.currentId) ? 'rain' : state.currentId, playing: ids.includes(state.currentId) ? false : state.playing, uploaded: [] };
    setState(next);
    await saveMusicState(next);
  };

  return (
    <section aria-labelledby={headingId} className={`music-player ${compact ? 'music-player-compact' : ''} rounded-2xl border border-db-border bg-db-surface p-4 shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-db-accent-soft text-db-accent">
          <MusicNotes aria-hidden="true" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="m-0 title-3 text-db-text">{t('music.title')}</h2>
          <p className="m-0 caption-4 text-db-muted">{t('music.subtitle')}</p>
        </div>
        <label className={`${secondaryBtn} cursor-pointer`}>
          <UploadSimple aria-hidden="true" size={16} />
          <span>{t('music.upload')}</span>
          <input type="file" accept="audio/*" multiple className="sr-only" onChange={(event) => void upload(event.target.files)} />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={secondaryBtn} aria-label={t('music.previous')} onClick={() => step(-1)}><SkipBack aria-hidden="true" size={16} weight="fill" /></button>
        <button type="button" className={primaryBtn} aria-label={t(state.playing ? 'music.pause' : 'music.play')} onClick={toggle}>
          {state.playing ? <Pause aria-hidden="true" size={17} weight="fill" /> : <Play aria-hidden="true" size={17} weight="fill" />}
        </button>
        <button type="button" className={secondaryBtn} aria-label={t('music.next')} onClick={() => step(1)}><SkipForward aria-hidden="true" size={16} weight="fill" /></button>
        <select aria-label={t('music.track')} value={state.currentId} onChange={(event) => void pick(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-db-border bg-db-surface px-3 py-2 body-6 text-db-text">
          <optgroup label={t('music.ambient')}>
            {tracks.slice(0, 2).map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
          </optgroup>
          {state.uploaded.length > 0 && <optgroup label={t('music.playlist')}>
            {tracks.slice(2).map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
          </optgroup>}
        </select>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 caption-4 text-db-muted">
          <span>{t('music.volume')}</span>
          <input aria-label={t('music.volume')} type="range" min="0" max="1" step="0.05" value={state.volume} onChange={(event) => volume(Number(event.target.value))} className="min-w-16 flex-1 accent-db-accent" />
        </label>
        {state.uploaded.length > 0 && <button type="button" className="db-press inline-flex items-center gap-1 border-0 bg-transparent caption-4 text-db-muted hover:text-db-text" onClick={() => void clearUploads()}>
          <Trash aria-hidden="true" size={14} />{t('music.clear')}
        </button>}
      </div>
      {error && <p role="alert" className="mb-0 mt-2 caption-4 text-db-urgent-fg">{t('music.error')}</p>}
    </section>
  );
}
