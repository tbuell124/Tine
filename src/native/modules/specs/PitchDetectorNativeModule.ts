import {NativeModules, Platform, TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

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
}

/**
 * Configuration for the detector start sequence.
 */
export interface StartOptions {
  /** Number of frames analysed per window. Defaults to 2048. */
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

const LINKING_ERROR =
  `The native module "PitchDetector" is not properly linked. Make sure you have run pod install` +
  (Platform.OS === 'ios' ? ' and rebuilt the iOS project.' : '.') +
  ' If you are using Expo Go this module will not be available.';

const isTurboModuleEnabled = (globalThis as any).__turboModuleProxy != null;

const moduleImpl: Spec | null = isTurboModuleEnabled
  ? TurboModuleRegistry.getEnforcing<Spec>('PitchDetector')
  : (NativeModules.PitchDetector as Spec | null);

if (!moduleImpl) {
  throw new Error(LINKING_ERROR);
}

/**
 * Native event name mirrored by the Objective-C implementation.
 */
export const PITCH_EVENT_NAME = 'onPitchData';

export default moduleImpl;
