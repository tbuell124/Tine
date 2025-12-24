import { midiToNoteName } from '@utils/music';
import { PitchSmoother } from '@utils/yinSmoothing';

import type { PitchEvent, StartOptions, StartResult } from './specs/pitchTypes';
import { WEB_WORKLET_URL } from './web/workletUrl';

type Listener = (event: PitchEvent) => void;

type Subscription = {
  remove: () => void;
};

const webListeners = new Set<Listener>();
const webSmoother = new PitchSmoother(15, 0.15);
let webThreshold = 0.12;

const toPitchEvent = (
  frequency: number | null,
  confidence: number,
  timestamp: number,
): PitchEvent => {
  if (!frequency || frequency <= 0 || confidence <= 0) {
    return {
      isValid: false,
      frequency: 0,
      midi: NaN,
      cents: 0,
      probability: confidence,
      noteName: '',
      timestamp,
    };
  }
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearestMidi = Math.round(midi);
  const refFreq = 440 * Math.pow(2, (nearestMidi - 69) / 12);
  const cents = 1200 * Math.log2(frequency / refFreq);
  const noteName = midiToNoteName(nearestMidi, 'sharp');
  return {
    isValid: true,
    frequency,
    midi,
    cents,
    probability: confidence,
    noteName,
    timestamp,
  };
};

let webCtx: AudioContext | null = null;
let webWorklet: AudioWorkletNode | null = null;
let webSource: MediaStreamAudioSourceNode | null = null;
let webStream: MediaStream | null = null;

export async function start(options: StartOptions = {}): Promise<StartResult> {
  if (webCtx) {
    return {
      sampleRate: webCtx.sampleRate,
      bufferSize: options.bufferSize ?? 4096,
      threshold: options.threshold ?? webThreshold,
    };
  }

  const bufferSize = options.bufferSize ?? 4096;
  webThreshold = options.threshold ?? 0.12;
  const preferredSampleRate = options.sampleRate ?? 44100;
  const estimatorRequested = options.estimator ?? 'yin';
  const estimator = estimatorRequested === 'neural-hybrid' ? 'yin' : estimatorRequested;

  try {
    webCtx = new AudioContext({ sampleRate: preferredSampleRate });
  } catch {
    webCtx = new AudioContext();
  }
  const gain = webCtx.createGain();
  gain.gain.value = 0;

  try {
    await webCtx.audioWorklet.addModule(WEB_WORKLET_URL);
    webStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    webSource = webCtx.createMediaStreamSource(webStream);
    webWorklet = new AudioWorkletNode(webCtx, 'yin-worklet-processor', {
      processorOptions: {
        bufferSize,
        threshold: webThreshold,
        sampleRate: preferredSampleRate,
        estimator,
      },
    });
    webWorklet.port.onmessage = (event) => {
      const payload = event.data as { frequency: number; probability: number; timestamp: number };
      const { frequency, confidence } = webSmoother.add({
        frequency: payload.frequency,
        probability: payload.probability,
        timestamp: payload.timestamp,
      });
      const evt = toPitchEvent(frequency, confidence, payload.timestamp);
      webListeners.forEach((listener) => {
        listener(evt);
      });
    };

    webSource.connect(webWorklet);
    webWorklet.connect(gain);
    gain.connect(webCtx.destination);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    sampleRate: webCtx.sampleRate,
    bufferSize,
    threshold: webThreshold,
    estimator: estimatorRequested,
    neuralReady: false,
  };
}

export async function stop(): Promise<boolean> {
  try {
    if (webStream) {
      webStream.getTracks().forEach((t) => {
        t.stop();
      });
      webStream = null;
    }
    if (webWorklet) {
      webWorklet.disconnect();
      webWorklet = null;
    }
    if (webCtx) {
      await webCtx.close();
      webCtx = null;
    }
    webListeners.clear();
    return true;
  } catch {
    return false;
  }
}

export function setThreshold(threshold: number): void {
  webThreshold = threshold;
}

export function addPitchListener(listener: Listener): Subscription {
  webListeners.add(listener);
  return {
    remove: () => {
      webListeners.delete(listener);
    },
  };
}

export function removeAllListeners(): void {
  webListeners.clear();
}

export default {
  start,
  stop,
  setThreshold,
  addPitchListener,
  removeAllListeners,
};
