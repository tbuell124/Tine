import { midiToNoteName } from '@utils/music';
import { PitchSmoother } from '@utils/yinSmoothing';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import PitchDetectorModule, {
  PITCH_EVENT_NAME,
  type PitchEvent,
  type StartOptions,
  type StartResult,
} from './specs/PitchDetectorNativeModule';
import { WEB_WORKLET_URL } from './web/workletUrl';

const nativeModuleForEvents = (() => {
  if (Platform.OS === 'web') {
    return undefined;
  }
  const candidate: any = NativeModules.PitchDetector ?? PitchDetectorModule;

  if (
    candidate &&
    typeof candidate.addListener === 'function' &&
    typeof candidate.removeListeners === 'function'
  ) {
    return candidate as Record<string, unknown>;
  }

  return undefined;
})();

type Listener = (event: PitchEvent) => void;

type InternalEmitter = {
  addListener: (
    eventName: string,
    listener: Listener,
  ) => {
    remove: () => void;
  };
  removeAllListeners: (eventName: string) => void;
};

const createFallbackEmitter = (): InternalEmitter => {
  const listenerMap = new Map<string, Set<Listener>>();

  return {
    addListener(eventName, listener) {
      const listeners = listenerMap.get(eventName) ?? new Set<Listener>();
      listeners.add(listener);
      listenerMap.set(eventName, listeners);

      return {
        remove: () => {
          const current = listenerMap.get(eventName);
          if (!current) {
            return;
          }
          current.delete(listener);
          if (current.size === 0) {
            listenerMap.delete(eventName);
          }
        },
      };
    },
    removeAllListeners(eventName) {
      listenerMap.delete(eventName);
    },
  };
};

const eventEmitter: InternalEmitter = nativeModuleForEvents
  ? new NativeEventEmitter(nativeModuleForEvents as any)
  : createFallbackEmitter();

// Web fallback using AudioWorklet + YIN
let webCtx: AudioContext | null = null;
let webWorklet: AudioWorkletNode | null = null;
let webSource: MediaStreamAudioSourceNode | null = null;
let webStream: MediaStream | null = null;
const webListeners = new Set<Listener>();
const webSmoother = new PitchSmoother(15, 0.15);
let webThreshold = 0.12;
let webNeuralReady = false;

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

type Subscription = {
  remove: () => void;
};

export async function start(options: StartOptions = {}): Promise<StartResult> {
  if (Platform.OS !== 'web') {
    return await PitchDetectorModule.start(options);
  }

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
  webNeuralReady = false;

  try {
    webCtx = new AudioContext({ sampleRate: preferredSampleRate });
  } catch {
    webCtx = new AudioContext();
  }
  const gain = webCtx.createGain();
  gain.gain.value = 0;

  try {
    await webCtx.audioWorklet.addModule(WEB_WORKLET_URL);
    if (estimatorRequested === 'neural-hybrid') {
      try {
        const { neuralHybridEstimator } = await import('./web/NeuralHybridEstimator');
        webNeuralReady = await neuralHybridEstimator.load(options.neuralModelUrl);
      } catch (error) {
        console.warn('Neural hybrid estimator unavailable on web', error);
      }
    }
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
    console.warn('Web YIN worklet failed to start', error);
    await stop();
    throw error;
  }

  return {
    sampleRate: webCtx.sampleRate,
    bufferSize,
    threshold: webThreshold,
    estimator: estimatorRequested,
    neuralReady: webNeuralReady,
  };
}

export async function stop(): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return await PitchDetectorModule.stop();
  }

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
  } catch (error) {
    console.warn('Web YIN stop failed', error);
    return false;
  }
}

export function setThreshold(threshold: number): void {
  if (Platform.OS !== 'web') {
    PitchDetectorModule.setThreshold(threshold);
    return;
  }
  webThreshold = threshold;
}

export function addPitchListener(listener: Listener): Subscription {
  if (Platform.OS !== 'web') {
    const subscription = eventEmitter.addListener(PITCH_EVENT_NAME, listener);
    return {
      remove: () => {
        subscription.remove();
      },
    };
  }
  webListeners.add(listener);
  return {
    remove: () => {
      webListeners.delete(listener);
    },
  };
}

export function removeAllListeners(): void {
  if (Platform.OS !== 'web') {
    eventEmitter.removeAllListeners(PITCH_EVENT_NAME);
    return;
  }
  webListeners.clear();
}

export default {
  start,
  stop,
  setThreshold,
  addPitchListener,
  removeAllListeners,
};
