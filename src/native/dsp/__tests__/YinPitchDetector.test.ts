import { YinPitchDetector } from '../YinPitchDetector';

describe('YinPitchDetector', () => {
  const sampleRate = 48000;
  const bufferSize = 2048;
  const threshold = 0.15;

  function generateSineWave(frequency: number): Float32Array {
    const buffer = new Float32Array(bufferSize);
    const angularFrequency = (2 * Math.PI * frequency) / sampleRate;
    for (let i = 0; i < bufferSize; i += 1) {
      buffer[i] = Math.sin(angularFrequency * i);
    }
    return buffer;
  }

  it('detects A4 within ±2 cents', () => {
    const detector = new YinPitchDetector(sampleRate, bufferSize, threshold);
    const frequency = 440;
    const samples = generateSineWave(frequency);

    const result = detector.processBuffer(samples, samples.length);

    expect(result.isValid).toBe(true);
    expect(result.noteName).toBe('A4');
    expect(Math.abs(result.midi - 69)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(result.cents)).toBeLessThanOrEqual(2);
  });
});
