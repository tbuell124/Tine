const WORKLET_SOURCE = `/* global AudioWorkletProcessor, currentTime, registerProcessor, sampleRate */
// Minimal YIN pitch detector in an AudioWorkletProcessor.
// Processes mono input and posts {frequency, probability, timestamp} to the main thread.

class YinWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options?.processorOptions ?? {};
    this.sampleRate = sampleRate;
    this.bufferSize = opts.bufferSize || 4096;
    this.threshold = opts.threshold || 0.1;
    this.halfBuffer = this.bufferSize / 2;
    this.difference = new Float32Array(this.halfBuffer);
    this.cumulativeMean = new Float32Array(this.halfBuffer);
    this.window = new Float32Array(this.bufferSize);
    this.buffer = new Float32Array(this.bufferSize);
    this.frame = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      // Hann window for leakage reduction.
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.bufferSize - 1)));
    }
    this.targetRms = opts.targetRms ?? 0.02;
    this.agcGain = 1;
    this.agcAlpha = 0.02; // slow-slew towards target RMS
    this.limiterThreshold = 0.95;
  }

  static get parameterDescriptors() {
    return [];
  }

  // Core YIN adapted from de Cheveigne & Kawahara (2002).
  yin(frame) {
    const n = frame.length;
    const half = Math.floor(n / 2);
    const diff = this.difference;
    const cmnd = this.cumulativeMean;

    // Step 2: difference function
    for (let tau = 0; tau < half; tau++) {
      let sum = 0;
      for (let i = 0; i < half; i++) {
        const delta = frame[i] - frame[i + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    // Step 3: cumulative mean normalized difference
    cmnd[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < half; tau++) {
      runningSum += diff[tau];
      cmnd[tau] = (diff[tau] * tau) / runningSum;
    }

    // Step 4: absolute threshold
    let tauEstimate = -1;
    for (let tau = 2; tau < half; tau++) {
      if (cmnd[tau] < this.threshold) {
        while (tau + 1 < half && cmnd[tau + 1] < cmnd[tau]) {
          tau++;
        }
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) {
      return { frequency: 0, probability: 0 };
    }

    // Step 5: parabolic interpolation for better tau
    const tau = tauEstimate;
    const x0 = tau > 0 ? cmnd[tau - 1] : cmnd[tau];
    const x1 = cmnd[tau];
    const x2 = tau + 1 < half ? cmnd[tau + 1] : cmnd[tau];
    const betterTau = tau + (x2 - x0) / (2 * (2 * x1 - x2 - x0));

    const freq = this.sampleRate / betterTau;
    const prob = 1 - cmnd[tauEstimate];
    return { frequency: freq, probability: prob };
  }

  processFrame(source) {
    let rmsSum = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      let sample = source[i];
      if (!Number.isFinite(sample)) {
        sample = 0;
      }
      rmsSum += sample * sample;
      this.frame[i] = sample;
    }
    const rms = Math.sqrt(rmsSum / this.bufferSize);
    const levelDb = rms > 0 ? 20 * Math.log10(rms) : -120;

    // Simple AGC: adjust gain towards target RMS.
    const currentGain = this.agcGain;
    const desiredGain = rms > 0 ? this.targetRms / rms : currentGain;
    this.agcGain = currentGain + (desiredGain - currentGain) * this.agcAlpha;

    let framedRms = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      let sample = this.frame[i] * this.agcGain;
      // Soft limiter to prevent clipping.
      if (sample > this.limiterThreshold) {
        sample = this.limiterThreshold + (sample - this.limiterThreshold) * 0.25;
      } else if (sample < -this.limiterThreshold) {
        sample = -this.limiterThreshold + (sample + this.limiterThreshold) * 0.25;
      }
      sample *= this.window[i];
      this.frame[i] = sample;
      framedRms += sample * sample;
    }
    const gatedRms = Math.sqrt(framedRms / this.bufferSize);
    const { frequency, probability } = this.yin(this.frame);
    this.port.postMessage({
      frequency: Number.isFinite(frequency) ? frequency : 0,
      probability: Number.isFinite(frequency) && frequency > 0 ? probability : 0,
      levelDb,
      timestamp: currentTime * 1000,
    });
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channel = input[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.writeIndex] = channel[i];
      this.writeIndex += 1;
      if (this.writeIndex >= this.bufferSize) {
        this.processFrame(this.buffer);
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('yin-worklet-processor', YinWorkletProcessor);
`;

let cachedBlobUrl: string | null = null;
let cachedDataUrl: string | null = null;

export const getWebWorkletSource = (): string => WORKLET_SOURCE;

export const getWebWorkletUrl = (): string => {
  if (cachedBlobUrl) {
    return cachedBlobUrl;
  }
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return './YinWorkletProcessor.js';
  }
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  cachedBlobUrl = URL.createObjectURL(blob);
  return cachedBlobUrl;
};

export const getWebWorkletDataUrl = (): string => {
  if (cachedDataUrl) {
    return cachedDataUrl;
  }
  if (typeof btoa !== 'function') {
    return './YinWorkletProcessor.js';
  }
  const encoded = btoa(WORKLET_SOURCE);
  cachedDataUrl = `data:application/javascript;base64,${encoded}`;
  return cachedDataUrl;
};
