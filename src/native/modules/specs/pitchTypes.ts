export interface PitchEvent {
  isValid: boolean;
  frequency: number;
  midi: number;
  cents: number;
  probability: number;
  noteName: string;
  /** Optional monotonic timestamp (ms) provided by the native detector for JS sync. */
  timestamp?: number;
}

export interface StartOptions {
  /**
   * Number of frames analysed per window. Defaults to 2048 (~46 ms at 44.1 kHz).
   * Lowering to 1024 or 512 can cut perceived latency for tuner UIs at the cost
   * of frequency resolution and noise rejection.
   */
  bufferSize?: number;
  /** YIN probability gate between 0 and 1. Defaults to 0.15. */
  threshold?: number;
}

export interface StartResult {
  sampleRate: number;
  bufferSize: number;
  threshold: number;
}

export const PITCH_EVENT_NAME = 'onPitchData';
