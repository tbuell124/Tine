import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';

import type { StartOptions, StartResult } from './pitchTypes';

export type { PitchEvent, StartOptions, StartResult } from './pitchTypes';
export { PITCH_EVENT_NAME } from './pitchTypes';

/**
 * Shared TurboModule contract implemented by the Objective-C detector.
 */
export interface Spec extends TurboModule {
  start(options?: StartOptions): Promise<StartResult>;
  stop(): Promise<boolean>;
  setThreshold(threshold: number): void;
}

export let LINKING_ERROR =
  `The native module "PitchDetector" is not properly linked. Make sure you have run pod install` +
  (Platform.OS === 'ios' ? ' and rebuilt the iOS project.' : '.') +
  ' If you are using Expo Go this module will not be available. Build a custom dev client to load the detector.';

const isTurboModuleEnabled = (globalThis as any).__turboModuleProxy != null;

let moduleImpl: Spec | null = null;

if (isTurboModuleEnabled) {
  try {
    moduleImpl = TurboModuleRegistry.get<Spec>('PitchDetector');
  } catch {
    moduleImpl = null;
  }
}

moduleImpl ??= (NativeModules.PitchDetector as Spec | null) ?? null;

const shouldLogWarnings =
  typeof process === 'undefined' ? true : process.env.NODE_ENV !== 'production';

let webFallback: {
  LINKING_ERROR: string;
  isPitchDetectorModuleAvailable: boolean;
  default: Spec;
} | null = null;

if (Platform.OS === 'web') {
  try {
    webFallback = require('./PitchDetectorNativeModule.web');
  } catch {
    webFallback = null;
  }
}

if (webFallback) {
  LINKING_ERROR = webFallback.LINKING_ERROR;
}

const createUnavailableModule = (): Spec => {
  const warn = () => {
    if (shouldLogWarnings && Platform.OS !== 'web') {
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
    },
  };
};

if (!moduleImpl && shouldLogWarnings && Platform.OS !== 'web') {
  console.warn(LINKING_ERROR);
}

export let isPitchDetectorModuleAvailable = moduleImpl != null;

if (webFallback) {
  isPitchDetectorModuleAvailable = webFallback.isPitchDetectorModuleAvailable;
  moduleImpl = webFallback.default;
}

export default moduleImpl ?? createUnavailableModule();
