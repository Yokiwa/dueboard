/** Plays a short two-note completion cue in a document-capable extension context. */
export function playCompletionCue(): boolean {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextType = scope.AudioContext ?? scope.webkitAudioContext;
  if (!AudioContextType) return false;

  const context = new AudioContextType();
  const start = context.currentTime;
  for (const [offset, frequency] of [[0, 659.25], [0.2, 880]] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.34);
  }
  globalThis.setTimeout(() => void context.close(), 800);
  return true;
}
