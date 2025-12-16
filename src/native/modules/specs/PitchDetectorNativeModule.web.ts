import type { PitchEvent, StartOptions, StartResult } from './pitchTypes';
import { PITCH_EVENT_NAME } from './pitchTypes';
import WebPitchDetector from '../web/WebPitchDetector';

export type { PitchEvent, StartOptions, StartResult } from './pitchTypes';
export { PITCH_EVENT_NAME } from './pitchTypes';

const hasAudioContext =
  typeof window !== 'undefined' &&
  (typeof window.AudioContext !== 'undefined' ||
    typeof (
      window as typeof window & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext !== 'undefined');

const isWebSupported =
  hasAudioContext &&
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices !== 'undefined' &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

export const LINKING_ERROR =
  'The web pitch detector requires microphone permissions and a browser with Web Audio support.';

const listeners = new Set<(event: PitchEvent) => void>();

const emit = (event: PitchEvent) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[PitchDetector:web] Listener threw', error);
      }
    }
  });
};

const detector = new WebPitchDetector(emit);

export const isPitchDetectorModuleAvailable = isWebSupported;

const moduleImpl = {
  async start(options: StartOptions = {}): Promise<StartResult> {
    if (!isWebSupported) {
      throw new Error(LINKING_ERROR);
    }

    const result = await detector.start(options);

    return {
      ...result,
      threshold: result.threshold,
    } satisfies StartResult;
  },
  async stop(): Promise<boolean> {
    return detector.stop();
  },
  setThreshold(threshold: number): void {
    detector.setThreshold(threshold);
  },
  addListener(eventName: string, listener: (event: PitchEvent) => void) {
    if (eventName === PITCH_EVENT_NAME) {
      listeners.add(listener);
      return {
        remove: () => listeners.delete(listener),
      };
    }

    return { remove: () => {} };
  },
  removeListeners(eventName: string) {
    if (eventName === PITCH_EVENT_NAME) {
      listeners.clear();
    }
  },
  removeAllListeners(eventName: string) {
    if (eventName === PITCH_EVENT_NAME) {
      listeners.clear();
    }
  },
};

export default moduleImpl;
