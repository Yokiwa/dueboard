import { getMusicBlob } from './library';
import { loadMusicState, saveMusicState, type MusicState } from './state';

export type MusicAction =
  | { action: 'play'; trackId: string }
  | { action: 'pause' }
  | { action: 'volume'; volume: number };

type AudioNodeWithStop = AudioBufferSourceNode | OscillatorNode;

class MusicEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nodes: AudioNodeWithStop[] = [];
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;

  private async audioContext(): Promise<AudioContext> {
    this.context ??= new AudioContext();
    await this.context.resume();
    return this.context;
  }

  private stopSource(): void {
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* The node already stopped. */ }
      node.disconnect();
    }
    this.nodes = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.gain?.disconnect();
    this.gain = null;
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
        data[i] = brown ? previous * 3.4 : white;
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private async playPreset(id: 'rain' | 'cabin', volume: number): Promise<void> {
    const context = await this.audioContext();
    const master = context.createGain();
    master.gain.value = volume * (id === 'rain' ? 0.36 : 0.48);
    master.connect(context.destination);
    this.gain = master;

    const noise = this.noise(context, id === 'cabin');
    const filter = context.createBiquadFilter();
    filter.type = id === 'rain' ? 'bandpass' : 'lowpass';
    filter.frequency.value = id === 'rain' ? 2600 : 420;
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
      humGain.gain.value = 0.035;
      hum.connect(humGain);
      humGain.connect(master);
      hum.start();
      this.nodes.push(hum);
    }
  }

  private async playUpload(id: string, state: MusicState): Promise<boolean> {
    const blob = await getMusicBlob(id);
    if (!blob) return false;
    const audio = new Audio();
    this.objectUrl = URL.createObjectURL(blob);
    audio.src = this.objectUrl;
    audio.volume = state.volume;
    audio.onended = () => void this.playNextUpload(id);
    this.audio = audio;
    await audio.play();
    return true;
  }

  private async playNextUpload(currentId: string): Promise<void> {
    const state = await loadMusicState();
    const index = state.uploaded.findIndex((track) => track.id === currentId);
    if (index < 0 || state.uploaded.length === 0) {
      await this.pause();
      return;
    }
    await this.play(state.uploaded[(index + 1) % state.uploaded.length]!.id);
  }

  async play(trackId: string): Promise<boolean> {
    this.stopSource();
    const state = await loadMusicState();
    const isPreset = trackId === 'rain' || trackId === 'cabin';
    const started = isPreset
      ? await this.playPreset(trackId, state.volume).then(() => true)
      : await this.playUpload(trackId, state);
    await saveMusicState({ ...state, currentId: started ? trackId : 'rain', playing: started });
    return started;
  }

  async pause(): Promise<void> {
    this.stopSource();
    const state = await loadMusicState();
    await saveMusicState({ ...state, playing: false });
  }

  async setVolume(volume: number): Promise<void> {
    const value = Math.min(1, Math.max(0, volume));
    if (this.gain) this.gain.gain.value = value * 0.4;
    if (this.audio) this.audio.volume = value;
    const state = await loadMusicState();
    await saveMusicState({ ...state, volume: value });
  }

  async control(message: MusicAction): Promise<boolean> {
    if (message.action === 'play') return this.play(message.trackId);
    if (message.action === 'pause') {
      await this.pause();
      return true;
    }
    await this.setVolume(message.volume);
    return true;
  }
}

const engine = new MusicEngine();

export function handleMusicControl(message: MusicAction): Promise<boolean> {
  return engine.control(message);
}
