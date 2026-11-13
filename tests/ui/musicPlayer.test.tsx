import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { renderIn } from './render';

vi.mock('../../src/ui/messaging', () => ({ sendToBackground: vi.fn(async () => true) }));
vi.mock('../../src/music/library', () => ({
  addMusicFiles: vi.fn(async () => [{ id: 'song-1', name: 'Study mix', size: 12, type: 'audio/mp3' }]),
  deleteMusicFiles: vi.fn(async () => undefined),
}));

import { MusicPlayer } from '../../src/ui/components/MusicPlayer';
import { sendToBackground } from '../../src/ui/messaging';

describe('MusicPlayer', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(sendToBackground).mockClear();
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
    await waitFor(() => expect(sendToBackground).toHaveBeenCalledWith({ type: 'musicControl', action: 'play', trackId: 'rain' }));
  });

  it('adds selected audio files to the personal playlist', async () => {
    renderIn('en', <MusicPlayer compact />);
    const input = screen.getByLabelText('Add music');
    const file = new File(['audio'], 'Study mix.mp3', { type: 'audio/mp3' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('combobox').textContent).toContain('Study mix'));
    expect(screen.getByRole('button', { name: 'Clear playlist' })).toBeTruthy();
  });

  it('links a YouTube Music song in the full Music tab', async () => {
    renderIn('en', <MusicPlayer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube Music link' }), {
      target: { value: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    const player = await screen.findByTitle('YouTube Music player') as HTMLIFrameElement;
    expect(player.src).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1');
    expect(screen.getByRole('link', { name: /Open in YouTube Music/ }).getAttribute('href')).toContain('music.youtube.com/watch');
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
