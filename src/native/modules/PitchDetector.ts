import {NativeEventEmitter, NativeModules, Platform, TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

export interface PitchEvent {
  isValid: boolean;
  frequency: number;
  midi: number;
  cents: number;
  probability: number;
  noteName: string;
}

export interface StartOptions {
  /** Number of frames analysed per window. Defaults to 2048. */
  bufferSize?: number;
  /** YIN probability gate between 0 and 1. Defaults to 0.15. */
  threshold?: number;
}

export interface StartResult {
  sampleRate: number;
  bufferSize: number;
  threshold: number;
}

interface Spec extends TurboModule {
  start(options?: StartOptions): Promise<StartResult>;
  stop(): Promise<boolean>;
  setThreshold(threshold: number): void;
}

const LINKING_ERROR =
  `The native module "PitchDetector" is not properly linked. Make sure you have run pod install` +
  (Platform.OS === 'ios' ? ' and rebuilt the iOS project.' : '.') +
  ' If you are using Expo Go this module will not be available.';

const isTurboModuleEnabled = (global as any).__turboModuleProxy != null;

const PitchDetectorModule: Spec | null = isTurboModuleEnabled
  ? TurboModuleRegistry.getEnforcing<Spec>('PitchDetector')
  : (NativeModules.PitchDetector as Spec | null);

if (!PitchDetectorModule) {
  throw new Error(LINKING_ERROR);
}

const eventEmitter = new NativeEventEmitter(NativeModules.PitchDetector ?? (PitchDetectorModule as any));
const EVENT_NAME = 'onPitchData';

type Listener = (event: PitchEvent) => void;

type Subscription = {
  remove: () => void;
};

export async function start(options: StartOptions = {}): Promise<StartResult> {
  return PitchDetectorModule.start(options);
}

export async function stop(): Promise<boolean> {
  return PitchDetectorModule.stop();
}

export function setThreshold(threshold: number): void {
  PitchDetectorModule.setThreshold(threshold);
}

export function addPitchListener(listener: Listener): Subscription {
  const subscription = eventEmitter.addListener(EVENT_NAME, listener);
  return {
    remove: () => subscription.remove(),
  };
}

export function removeAllListeners(): void {
  eventEmitter.removeAllListeners(EVENT_NAME);
}

export default {
  start,
  stop,
  setThreshold,
  addPitchListener,
  removeAllListeners,
};
