import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';

/**
 * Event payload emitted every time a new pitch estimate is available.
 */
export interface PitchEvent {
  isValid: boolean;
  frequency: number;
  midi: number;
  cents: number;
  probability: number;
  noteName: string;
  /** Optional monotonic timestamp (ms) provided by the native detector for JS sync. */
  timestamp?: number;
}

/**
 * Configuration for the detector start sequence.
 */
export interface StartOptions {
  /**
   * Number of frames analysed per window. Defaults to 2048 (~46 ms at 44.1 kHz).
   * Lowering to 1024 or 512 can cut perceived latency for tuner UIs at the cost
   * of frequency resolution and noise rejection.
   */
  bufferSize?: number;
  /** YIN probability gate between 0 and 1. Defaults to 0.15. */
  threshold?: number;
}

/**
 * Metadata describing the running detector instance.
 */
export interface StartResult {
  sampleRate: number;
  bufferSize: number;
  threshold: number;
}

/**
 * Shared TurboModule contract implemented by the Objective-C detector.
 */
export interface Spec extends TurboModule {
  start(options?: StartOptions): Promise<StartResult>;
  stop(): Promise<boolean>;
  setThreshold(threshold: number): void;
}

export const LINKING_ERROR =
  `The native module "PitchDetector" is not properly linked. Make sure you have run pod install` +
  (Platform.OS === 'ios' ? ' and rebuilt the iOS project.' : '.') +
  ' If you are using Expo Go this module will not be available. Build a custom dev client to load the detector.';

const isTurboModuleEnabled = (globalThis as any).__turboModuleProxy != null;

let moduleImpl: Spec | null = null;

if (isTurboModuleEnabled) {
  try {
    moduleImpl = TurboModuleRegistry.get<Spec>('PitchDetector');
  } catch (error) {
    moduleImpl = null;
  }
}

if (!moduleImpl) {
  moduleImpl = (NativeModules.PitchDetector as Spec | null) ?? null;
}

const shouldLogWarnings =
  typeof process === 'undefined' ? true : process.env.NODE_ENV !== 'production';

const createUnavailableModule = (): Spec => {
  const warn = () => {
    if (shouldLogWarnings) {
      console.warn(LINKING_ERROR);
    }
  };

  return {
    async start() {
      warn();
      throw new Error(LINKING_ERROR);
    },
    async stop() {
      warn();
      return false;
    },
    setThreshold() {
      warn();
    }
  };
};

if (!moduleImpl && shouldLogWarnings) {
  console.warn(LINKING_ERROR);
}

export const isPitchDetectorModuleAvailable = moduleImpl != null;

/**
 * Native event name mirrored by the Objective-C implementation.
 */
export const PITCH_EVENT_NAME = 'onPitchData';

export default moduleImpl ?? createUnavailableModule();
