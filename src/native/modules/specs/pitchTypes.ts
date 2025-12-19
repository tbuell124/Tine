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
  /**
   * Preferred input sample rate in Hz. Defaults to 44100 with a fallback to 48000
   * on Android where the system mixer commonly resamples.
   */
  sampleRate?: number;
  /**
   * Pitch estimator to use. Native layers may map this to the closest available
   * implementation (e.g., YIN, FFT-YIN, HPS).
   */
  estimator?: 'yin' | 'fft-yin' | 'hps' | 'neural-hybrid';
  /** Optional URL or path to a neural model (e.g., ONNX/CoreML/TFLite) when using neural-hybrid. */
  neuralModelUrl?: string;
}

export interface StartResult {
  sampleRate: number;
  bufferSize: number;
  threshold: number;
  estimator?: StartOptions['estimator'];
  neuralReady?: boolean;
}

export const PITCH_EVENT_NAME = 'onPitchData';
