/* global AudioWorkletProcessor, currentTime, registerProcessor, sampleRate */
// Minimal YIN pitch detector in an AudioWorkletProcessor.
// Processes mono input and posts {frequency, probability, timestamp} to the main thread.

class YinWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options?.processorOptions ?? {};
    this.sampleRate = sampleRate;
    this.bufferSize = opts.bufferSize || 4096;
    this.threshold = opts.threshold || 0.12;
    this.halfBuffer = this.bufferSize / 2;
    this.difference = new Float32Array(this.halfBuffer);
    this.cumulativeMean = new Float32Array(this.halfBuffer);
    this.window = new Float32Array(this.bufferSize);
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

  // Core YIN adapted from de Cheveigné & Kawahara (2002).
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

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channel = input[0];
    if (channel.length < this.bufferSize) {
      return true;
    }

    const frame = new Float32Array(this.bufferSize);
    let rmsSum = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      const sample = channel[i];
      rmsSum += sample * sample;
    }
    const rms = Math.sqrt(rmsSum / this.bufferSize);

    if (rms < 0.001) {
      return true;
    }

    // Simple AGC: adjust gain towards target RMS.
    const currentGain = this.agcGain;
    const desiredGain = rms > 0 ? this.targetRms / rms : currentGain;
    this.agcGain = currentGain + (desiredGain - currentGain) * this.agcAlpha;

    let framedRms = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      let sample = channel[i] * this.agcGain;
      // Soft limiter to prevent clipping.
      if (sample > this.limiterThreshold) {
        sample = this.limiterThreshold + (sample - this.limiterThreshold) * 0.25;
      } else if (sample < -this.limiterThreshold) {
        sample = -this.limiterThreshold + (sample + this.limiterThreshold) * 0.25;
      }
      sample *= this.window[i];
      frame[i] = sample;
      framedRms += sample * sample;
    }
    const gatedRms = Math.sqrt(framedRms / this.bufferSize);
    if (gatedRms < 0.0015) {
      return true;
    }

    const { frequency, probability } = this.yin(frame);
    if (Number.isFinite(frequency) && frequency > 0) {
      this.port.postMessage({
        frequency,
        probability,
        timestamp: currentTime * 1000,
      });
    }

    return true;
  }
}

registerProcessor('yin-worklet-processor', YinWorkletProcessor);
