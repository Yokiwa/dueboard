import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { renderIn } from './render';

const { play, pause, setVolume } = vi.hoisted(() => ({
  play: vi.fn(async () => true),
  pause: vi.fn(),
  setVolume: vi.fn(),
}));
vi.mock('../../src/music/player', () => ({
  musicEngine: { play, pause, setVolume, playing: false, currentId: null },
}));
vi.mock('../../src/music/library', () => ({
  addMusicFiles: vi.fn(async () => [{ id: 'song-1', name: 'Study mix', size: 12, type: 'audio/mp3' }]),
  deleteMusicFiles: vi.fn(async () => undefined),
}));

import { MusicPlayer } from '../../src/ui/components/MusicPlayer';

describe('MusicPlayer', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    play.mockClear();
    pause.mockClear();
    setVolume.mockClear();
  });

  it('offers rain, airplane cabin, playback, volume and playlist upload', async () => {
    renderIn('en', <MusicPlayer />);
    expect(screen.getByRole('heading', { name: 'Focus sounds' })).toBeTruthy();
    const track = screen.getByRole('combobox', { name: 'Sound or track' });
    expect(track.textContent).toContain('Rain');
    expect(track.textContent).toContain('Airplane cabin');
    expect(screen.getByLabelText('Add music').getAttribute('multiple')).not.toBeNull();
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(play).toHaveBeenCalledWith('rain', 0.45));
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.7' } });
    expect(setVolume).toHaveBeenCalledWith(0.7);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(pause).toHaveBeenCalledOnce());
  });

  it('shows an error and does not pretend to play when audio startup fails', async () => {
    play.mockRejectedValueOnce(new Error('autoplay blocked'));
    renderIn('en', <MusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be played'));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('adds selected audio files to the personal playlist', async () => {
    renderIn('en', <MusicPlayer compact />);
    const input = screen.getByLabelText('Add music');
    const file = new File(['audio'], 'Study mix.mp3', { type: 'audio/mp3' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('combobox').textContent).toContain('Study mix'));
    expect(screen.getByRole('button', { name: 'Clear playlist' })).toBeTruthy();
  });

  it('saves a YouTube Music song and opens it on the official site', async () => {
    renderIn('en', <MusicPlayer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube Music link' }), {
      target: { value: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    const link = await screen.findByRole('link', { name: /Open in YouTube Music/ });
    expect(link.getAttribute('href')).toContain('music.youtube.com/watch');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.queryByTitle('YouTube Music player')).toBeNull();
  });

  it('rejects invalid links and keeps the compact player small', () => {
    const full = renderIn('en', <MusicPlayer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube Music link' }), { target: { value: 'https://example.com/not-music' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.getByRole('alert').textContent).toContain('valid YouTube Music');
    full.unmount();

    renderIn('en', <MusicPlayer compact />);
    expect(screen.queryByRole('textbox', { name: 'YouTube Music link' })).toBeNull();
  });
});
