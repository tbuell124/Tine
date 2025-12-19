export type PitchSample = {
  frequency: number;
  probability: number;
  timestamp: number;
};

export class PitchSmoother {
  private freqHistory: number[] = [];
  private readonly maxSize: number;
  private readonly confAlpha: number;
  private smoothedConfidence = 0;

  constructor(maxSize = 15, confAlpha = 0.15) {
    this.maxSize = maxSize;
    this.confAlpha = confAlpha;
  }

  add(sample: PitchSample): { frequency: number | null; confidence: number } {
    if (!Number.isFinite(sample.frequency) || sample.frequency <= 0) {
      this.smoothedConfidence = 0;
      this.freqHistory = [];
      return { frequency: null, confidence: 0 };
    }

    this.smoothedConfidence =
      this.smoothedConfidence + (sample.probability - this.smoothedConfidence) * this.confAlpha;

    this.freqHistory = [...this.freqHistory.slice(-(this.maxSize - 1)), sample.frequency];
    const median = this.getMedian(this.freqHistory);

    // Discard outliers > 50 cents from median.
    const cents = 1200 * Math.log2(sample.frequency / median);
    if (Math.abs(cents) > 50) {
      return { frequency: median, confidence: this.smoothedConfidence };
    }

    return { frequency: median, confidence: this.smoothedConfidence };
  }

  private getMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
}
