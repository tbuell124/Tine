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

type Listener = (event: PitchEvent) => void;

type InternalEmitter = {
  addListener: (eventName: string, listener: Listener) => {
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
