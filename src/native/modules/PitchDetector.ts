import {NativeEventEmitter, NativeModules} from 'react-native';

import PitchDetectorModule, {
  PITCH_EVENT_NAME,
  type PitchEvent,
  type StartOptions,
  type StartResult,
} from './specs/PitchDetectorNativeModule';

const nativeModuleForEvents = (() => {
  const candidate =
    NativeModules.PitchDetector ?? (PitchDetectorModule as unknown as Record<string, unknown>);

  if (
    candidate &&
    typeof (candidate as any).addListener === 'function' &&
    typeof (candidate as any).removeListeners === 'function'
  ) {
    return candidate as Record<string, unknown>;
  }

  return undefined;
})();

const eventEmitter = new NativeEventEmitter(nativeModuleForEvents as any);

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
  const subscription = eventEmitter.addListener(PITCH_EVENT_NAME, listener);
  return {
    remove: () => subscription.remove(),
  };
}

export function removeAllListeners(): void {
  eventEmitter.removeAllListeners(PITCH_EVENT_NAME);
}

export default {
  start,
  stop,
  setThreshold,
  addPitchListener,
  removeAllListeners,
};
