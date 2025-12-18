import { PitchDetector as PitchyDetector } from 'pitchy';

import { midiToNoteName } from '@utils/music';

import type { PitchEvent, StartOptions, StartResult } from '../specs/pitchTypes';

const A4_FREQUENCY = 440;
const A4_MIDI = 69;

const clampProbability = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return Number(value.toFixed(4));
};

const midiFromFrequency = (frequency: number): number =>
  A4_MIDI + 12 * Math.log2(frequency / A4_FREQUENCY);

const frequencyFromMidi = (midi: number): number =>
  A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12);

const resolveTimestamp = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

const getAudioContextConstructor = (): typeof AudioContext | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const audioContext = window.AudioContext;
  const legacyAudioContext = (window as typeof window & { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;

  return audioContext ?? legacyAudioContext;
};

export class WebPitchDetector {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private buffer: Float32Array | null = null;
  private detector: ReturnType<typeof PitchyDetector.forFloat32Array> | null = null;
  private rafId: number | null = null;
  private stream?: MediaStream;
  private clarityThreshold = 0.15;

  constructor(private readonly emit: (event: PitchEvent) => void) {}

  async start(options: StartOptions = {}): Promise<StartResult> {
    const AudioContextCtor = getAudioContextConstructor();

    if (!AudioContextCtor || !navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Web Audio API or microphone access is unavailable in this environment.');
    }

    if (this.audioContext || this.stream) {
      await this.stop();
    }

    const bufferSize = options.bufferSize ?? 2048;
    this.clarityThreshold = clampProbability(options.threshold ?? 0.15);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.audioContext = new AudioContextCtor();

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        await this.stop();
        throw error;
      }
    }

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = bufferSize;

    this.buffer = new Float32Array(this.analyser.fftSize);
    this.detector = PitchyDetector.forFloat32Array(this.analyser.fftSize);

    source.connect(this.analyser);
    this.startPolling();

    return {
      sampleRate: this.audioContext.sampleRate,
      bufferSize: this.analyser.fftSize,
      threshold: this.clarityThreshold,
    };
  }

  async stop(): Promise<boolean> {
    const wasRunning = this.audioContext !== null || this.stream !== undefined;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.buffer = null;
    this.detector = null;

    return wasRunning;
  }

  setThreshold(threshold: number): void {
    this.clarityThreshold = clampProbability(threshold);
  }

  private startPolling(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }

    const tick = () => {
      this.readFrame();
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private readFrame(): void {
    if (!this.analyser || !this.buffer || !this.detector || !this.audioContext) {
      return;
    }

    this.analyser.getFloatTimeDomainData(this.buffer);
    const [frequency, clarity] = this.detector.findPitch(this.buffer, this.audioContext.sampleRate);
    const probability = clampProbability(clarity);
    const timestamp = resolveTimestamp();

    const isValid = Number.isFinite(frequency) && frequency > 0 && probability >= this.clarityThreshold;

    if (!isValid) {
      this.emit({
        isValid: false,
        frequency: 0,
        midi: 0,
        cents: 0,
        probability,
        noteName: '',
        timestamp,
      });
      return;
    }

    const midi = midiFromFrequency(frequency);
    const nearestMidi = Math.round(midi);
    const referenceFrequency = frequencyFromMidi(nearestMidi);
    const cents = Number.isFinite(referenceFrequency)
      ? 1200 * Math.log2(frequency / referenceFrequency)
      : 0;

    this.emit({
      isValid: true,
      frequency,
      midi,
      cents,
      probability,
      noteName: midiToNoteName(nearestMidi),
      timestamp,
    });
  }
}

export default WebPitchDetector;
