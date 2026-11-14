import { getMusicBlob } from './library';

export type AmbientTrackId = 'rain' | 'cabin';

type StoppableNode = AudioBufferSourceNode | OscillatorNode;

const clampVolume = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.45));

/**
 * Plays focus audio in the visible dashboard page.
 *
 * Creating/resuming the AudioContext synchronously from the Play click is important:
 * Chrome can reject audio started later from a background or offscreen extension page.
 */
export class MusicEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nodes: StoppableNode[] = [];
  private playingId: string | null = null;

  constructor(
    private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly readBlob: (id: string) => Promise<Blob | null> = getMusicBlob,
  ) {}

  get currentId(): string | null {
    return this.playingId;
  }

  get playing(): boolean {
    return this.playingId !== null;
  }

  private stopNodes(): void {
    for (const node of this.nodes) {
      node.onended = null;
      try { node.stop(); } catch { /* It may already have ended. */ }
      node.disconnect();
    }
    this.nodes = [];
    this.gain?.disconnect();
    this.gain = null;
    this.playingId = null;
  }

  private noise(context: AudioContext, brown: boolean): AudioBufferSourceNode {
    const seconds = 4;
    const buffer = context.createBuffer(2, context.sampleRate * seconds, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        previous = brown ? (previous + 0.02 * white) / 1.02 : white;
        data[i] = brown ? previous * 0.7 : white * 0.12;
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private playPreset(context: AudioContext, id: AmbientTrackId, master: GainNode): void {
    const noise = this.noise(context, id === 'cabin');
    const filter = context.createBiquadFilter();
    filter.type = id === 'rain' ? 'bandpass' : 'lowpass';
    filter.frequency.value = id === 'rain' ? 2_600 : 420;
    filter.Q.value = id === 'rain' ? 0.45 : 0.7;
    noise.connect(filter);
    filter.connect(master);
    noise.start();
    this.nodes.push(noise);

    if (id === 'cabin') {
      const hum = context.createOscillator();
      const humGain = context.createGain();
      hum.type = 'sine';
      hum.frequency.value = 74;
      humGain.gain.value = 0.025;
      hum.connect(humGain);
      humGain.connect(master);
      hum.start();
      this.nodes.push(hum);
    }
  }

  async play(trackId: string, volume: number): Promise<boolean> {
    // This happens before the first await so the browser can associate it with the user's click.
    this.context ??= this.createContext();
    const context = this.context;
    await context.resume();

    let decoded: AudioBuffer | null = null;
    if (trackId !== 'rain' && trackId !== 'cabin') {
      const blob = await this.readBlob(trackId);
      if (!blob) return false;
      decoded = await context.decodeAudioData(await blob.arrayBuffer());
    }

    this.stopNodes();
    const master = context.createGain();
    master.gain.value = clampVolume(volume);
    master.connect(context.destination);
    this.gain = master;

    if (trackId === 'rain' || trackId === 'cabin') {
      this.playPreset(context, trackId, master);
    } else {
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(master);
      source.onended = () => {
        if (this.playingId === trackId) this.stopNodes();
      };
      source.start();
      this.nodes.push(source);
    }
    this.playingId = trackId;
    return true;
  }

  pause(): void {
    this.stopNodes();
  }

  setVolume(volume: number): void {
    if (this.gain) this.gain.gain.value = clampVolume(volume);
  }
}

export const musicEngine = new MusicEngine();
