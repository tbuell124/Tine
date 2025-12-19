// Minimal placeholder for a neural hybrid estimator.
// This is ready to be swapped with a lightweight model loader (e.g., onnxruntime-web).

export type NeuralPrediction = {
  frequency: number;
  confidence: number;
} | null;

class NeuralHybridEstimator {
  private ready = false;
  private modelUrl?: string;

  async load(modelUrl?: string): Promise<boolean> {
    this.modelUrl = modelUrl;
    // TODO: load ONNX/CoreML/TFLite model here. Placeholder returns false.
    this.ready = false;
    return this.ready;
  }

  isReady(): boolean {
    return this.ready;
  }

  predict(_frame: Float32Array): NeuralPrediction {
    // TODO: run model inference and return top candidate.
    return null;
  }
}

export const neuralHybridEstimator = new NeuralHybridEstimator();
