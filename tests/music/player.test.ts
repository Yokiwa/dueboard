import { describe, expect, it, vi } from 'vitest';
import { MusicEngine } from '../../src/music/player';

function fakeAudioContext() {
  const sources: Array<{
    buffer: unknown;
    loop: boolean;
    onended: (() => void) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const node = () => {
    const value = {
      buffer: null as unknown,
      loop: false,
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    sources.push(value);
    return value;
  };
  const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    sampleRate: 10,
    destination: {},
    resume: vi.fn(async () => undefined),
    createBuffer: vi.fn(() => ({ numberOfChannels: 2, getChannelData: () => new Float32Array(40) })),
    createBufferSource: vi.fn(node),
    createBiquadFilter: vi.fn(() => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() })),
    createOscillator: vi.fn(() => ({ ...node(), type: '', frequency: { value: 0 } })),
    createGain: vi.fn(() => gain),
    decodeAudioData: vi.fn(async () => ({ decoded: true })),
  };
  return { context, sources, gain };
}

describe('MusicEngine', () => {
  it('starts ambient audio in the visible page and updates volume', async () => {
    const { context, sources, gain } = fakeAudioContext();
    const engine = new MusicEngine(() => context as unknown as AudioContext);

    await expect(engine.play('rain', 0.45)).resolves.toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(sources[0]?.start).toHaveBeenCalledOnce();
    expect(engine.playing).toBe(true);
    engine.setVolume(0.8);
    expect(gain.gain.value).toBe(0.8);
    engine.pause();
    expect(engine.playing).toBe(false);
  });

  it('resumes audio before loading and decoding an uploaded track', async () => {
    const { context, sources } = fakeAudioContext();
    const order: string[] = [];
    context.resume.mockImplementation(async () => { order.push('resume'); });
    const blob = new Blob(['audio']);
    const engine = new MusicEngine(
      () => context as unknown as AudioContext,
      async () => { order.push('blob'); return blob; },
    );

    await expect(engine.play('song-1', 0.5)).resolves.toBe(true);
    expect(order).toEqual(['resume', 'blob']);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(sources[0]?.start).toHaveBeenCalledOnce();
  });

  it('does not report playback when an uploaded track is missing', async () => {
    const { context } = fakeAudioContext();
    const engine = new MusicEngine(() => context as unknown as AudioContext, async () => null);
    await expect(engine.play('missing', 0.5)).resolves.toBe(false);
    expect(engine.playing).toBe(false);
  });
});
