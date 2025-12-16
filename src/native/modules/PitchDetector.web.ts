import PitchDetectorModule, {
  PITCH_EVENT_NAME,
  type PitchEvent,
  type StartOptions,
  type StartResult,
} from './specs/PitchDetectorNativeModule';

const eventSource = PitchDetectorModule as typeof PitchDetectorModule & {
  addListener?: (eventName: string, listener: (event: PitchEvent) => void) => { remove: () => void };
  removeListeners?: (eventName: string) => void;
  removeAllListeners?: (eventName: string) => void;
};

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
  if (typeof eventSource.addListener === 'function') {
    return eventSource.addListener(PITCH_EVENT_NAME, listener);
  }

  return { remove: () => {} };
}

export function removeAllListeners(): void {
  if (typeof eventSource.removeAllListeners === 'function') {
    eventSource.removeAllListeners(PITCH_EVENT_NAME);
    return;
  }

  if (typeof eventSource.removeListeners === 'function') {
    eventSource.removeListeners(PITCH_EVENT_NAME);
  }
}

export default {
  start,
  stop,
  setThreshold,
  addPitchListener,
  removeAllListeners,
};
