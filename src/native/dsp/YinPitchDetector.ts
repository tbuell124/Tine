/**
 * Pure TypeScript mirror of the native YIN pitch detector. This implementation
 * is used inside unit tests so we can validate the behaviour of the native
 * detector with deterministic inputs without depending on the platform bridges.
 */

export interface PitchResult {
  isValid: boolean;
  frequency: number;
  midi: number;
  cents: number;
  probability: number;
  noteName: string;
}

const MIN_THRESHOLD = 0.001;
const MAX_THRESHOLD = 0.999;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class YinPitchDetector {
  private readonly sampleRate: number;
  private readonly bufferSize: number;
  private readonly maxLag: number;
  private threshold: number;
  private readonly difference: Float64Array;
  private readonly cumulative: Float64Array;
  private lastResult: PitchResult;

  constructor(sampleRate: number, bufferSize: number, threshold: number) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.maxLag = Math.floor(bufferSize / 2);
    this.threshold = clamp(threshold, MIN_THRESHOLD, MAX_THRESHOLD);
    this.difference = new Float64Array(this.maxLag + 1);
    this.cumulative = new Float64Array(this.maxLag + 1);
    this.lastResult = {
      isValid: false,
      frequency: 0,
      midi: 0,
      cents: 0,
      probability: 0,
      noteName: '',
    };
  }

  setThreshold(threshold: number): void {
    this.threshold = clamp(threshold, MIN_THRESHOLD, MAX_THRESHOLD);
  }

  getLastResult(): PitchResult {
    return this.lastResult;
  }

  processBuffer(samples: ArrayLike<number>, numSamples: number): PitchResult {
    const emptyResult: PitchResult = {
      isValid: false,
      frequency: 0,
      midi: 0,
      cents: 0,
      probability: 0,
      noteName: '',
    };

    if (!samples || numSamples < this.bufferSize || this.maxLag < 2 || this.sampleRate <= 0) {
      this.lastResult = emptyResult;
      return this.lastResult;
    }

    this.computeDifference(samples);
    this.computeCumulativeMeanNormalized();

    let probability = 0;
    const tau = this.absoluteThreshold((value) => {
      probability = value;
    });

    if (tau === 0) {
      this.lastResult = emptyResult;
      return this.lastResult;
    }

    let refinedTau = tau;
    if (tau > 1 && tau < this.maxLag) {
      refinedTau = this.parabolicInterpolation(tau, this.cumulative);
    }

    if (refinedTau <= 0) {
      this.lastResult = emptyResult;
      return this.lastResult;
    }

    const frequency = this.sampleRate / refinedTau;
    if (!Number.isFinite(frequency) || frequency <= 0) {
      this.lastResult = emptyResult;
      return this.lastResult;
    }

    const midi = YinPitchDetector.midiFromFrequency(frequency);
    const nearestMidi = Math.round(midi);
    const cents = (midi - nearestMidi) * 100;

    const result: PitchResult = {
      isValid: probability > 0,
      frequency,
      midi,
      cents,
      probability: clamp(probability, 0, 1),
      noteName: YinPitchDetector.noteNameFromMidi(nearestMidi),
    };

    this.lastResult = result;
    return this.lastResult;
  }

  private computeDifference(samples: ArrayLike<number>): void {
    this.difference.fill(0);

    for (let tau = 1; tau <= this.maxLag; tau += 1) {
      let sum = 0;
      for (let i = 0; i < this.bufferSize - tau; i += 1) {
        const delta = Number(samples[i]) - Number(samples[i + tau]);
        sum += delta * delta;
      }
      this.difference[tau] = sum;
    }

    this.difference[0] = 0;
  }

  private computeCumulativeMeanNormalized(): void {
    this.cumulative[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau <= this.maxLag; tau += 1) {
      runningSum += this.difference[tau];
      if (runningSum === 0) {
        this.cumulative[tau] = 1;
      } else {
        this.cumulative[tau] = (this.difference[tau] * tau) / runningSum;
      }
    }
  }

  private absoluteThreshold(updateProbability: (probability: number) => void): number {
    for (let tau = 2; tau < this.cumulative.length; tau += 1) {
      if (this.cumulative[tau] < this.threshold) {
        while (
          tau + 1 < this.cumulative.length &&
          this.cumulative[tau + 1] < this.cumulative[tau]
        ) {
          tau += 1;
        }
        updateProbability(1 - this.cumulative[tau]);
        return tau;
      }
    }

    let minValue = Number.POSITIVE_INFINITY;
    let candidate = 0;

    for (let tau = 2; tau < this.cumulative.length; tau += 1) {
      if (this.cumulative[tau] < minValue) {
        minValue = this.cumulative[tau];
        candidate = tau;
      }
    }

    if (Number.isFinite(minValue)) {
      updateProbability(1 - minValue);
    } else {
      updateProbability(0);
      candidate = 0;
    }

    return candidate;
  }

  private parabolicInterpolation(tau: number, values: Float64Array): number {
    if (tau <= 0 || tau >= values.length - 1) {
      return tau;
    }

    const s0 = values[tau - 1];
    const s1 = values[tau];
    const s2 = values[tau + 1];
    const denominator = s0 + s2 - 2 * s1;

    if (denominator === 0) {
      return tau;
    }

    const adjustment = (0.5 * (s0 - s2)) / denominator;
    return tau + adjustment;
  }

  static midiFromFrequency(frequency: number): number {
    if (frequency <= 0) {
      return 0;
    }

    return 69 + 12 * Math.log2(frequency / 440);
  }

  static noteNameFromMidi(midi: number): string {
    if (!Number.isFinite(midi)) {
      return '';
    }

    const rounded = Math.round(midi);
    const noteIndex = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[noteIndex]}${octave}`;
  }
}

export default YinPitchDetector;
