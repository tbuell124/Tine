import { useEffect, useMemo, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

/**
 * Snapshot of the tuner surface state. Mirrors the minimal shape consumed by the
 * foundation UI while the real DSP stack is disconnected.
 */
export type PitchDetectionSnapshot = {
  note: string;
  frequency: number;
  cents: number;
  energy: number;
  locked: boolean;
};

export type UsePitchDetectionOptions = {
  /**
   * When true the hook pretends the listener granted microphone permission and
   * begins synthesising tuner updates. In a future iteration this will start
   * the native audio engine once the underlying module is available.
   */
  enabled: boolean;
};

export type UsePitchDetectionResult = {
  /**
   * Latest simulated tuner snapshot rendered by the UI.
   */
  snapshot: PitchDetectionSnapshot;
  /**
   * Indicates whether the native TunePlay audio module is registered on the
   * current platform. The foundation build keeps returning simulated data even
   * when the module exists so designers can iterate without native bits.
   */
  isNativeModuleAvailable: boolean;
  /**
   * Reflects whether the hook is currently falling back to the simulated data
   * path or has successfully activated the native module. The UI can surface a
   * subtle indicator so testers understand when the fake pipeline is running.
   */
  mode: 'simulated' | 'native';
};

const SAMPLE_NOTES = [
  { name: 'E2', frequency: 82.41 },
  { name: 'A2', frequency: 110.0 },
  { name: 'D3', frequency: 146.83 },
  { name: 'G3', frequency: 196.0 },
  { name: 'B3', frequency: 246.94 },
  { name: 'E4', frequency: 329.63 }
] as const;

const DEFAULT_SNAPSHOT: PitchDetectionSnapshot = {
  note: SAMPLE_NOTES[0].name,
  frequency: SAMPLE_NOTES[0].frequency,
  cents: 0,
  energy: 0,
  locked: false
};

type NativeAudioModule =
  | {
      install?: () => boolean;
      start?: () => Promise<unknown> | unknown;
      stop?: () => void;
    }
  | undefined;

const getNativeAudioModule = (): NativeAudioModule =>
  (NativeModules as { TunePlayAudioModule?: NativeAudioModule }).TunePlayAudioModule;

/**
 * Minimal pitch-detection hook that keeps the UI breathing while gracefully
 * handling environments where the native TunePlay audio module is unavailable
 * (for example Expo Go or simulator previews without the dev client). The
 * simulated signal mirrors the previous `useFakeTuner` helper so designers see
 * familiar motion, and we avoid instantiating `NativeEventEmitter` with a null
 * module which previously crashed the foundation app.
 */
export const usePitchDetection = (
  options: UsePitchDetectionOptions
): UsePitchDetectionResult => {
  const { enabled } = options;
  const nativeModuleRef = useRef<NativeAudioModule>();

  if (nativeModuleRef.current === undefined) {
    nativeModuleRef.current = getNativeAudioModule();
  }

  const [noteIndex, setNoteIndex] = useState(0);
  const [cents, setCents] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [mode, setMode] = useState<'simulated' | 'native'>('simulated');

  // Attempt to start the native module when it exists. We intentionally swallow
  // failures so Expo/Metro previews fall back to the simulated data rather than
  // crashing due to `NativeEventEmitter` receiving a null module argument.
  useEffect(() => {
    const nativeModule = nativeModuleRef.current;

    if (!enabled) {
      setMode('simulated');
      return;
    }

    if (!nativeModule) {
      // No native module in this runtime (likely Expo Go); keep returning
      // simulated frames without warning spam in production builds.
      if (process.env.NODE_ENV !== 'production') {
        console.info(
          '[TunePlay] Native audio module missing – using simulated pitch detection.'
        );
      }
      return;
    }

    let cancelled = false;

    try {
      if (typeof nativeModule.install === 'function') {
        nativeModule.install();
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[TunePlay] Failed to install TunePlayAudioModule', error);
      }
    }

    const startNativeModule = async () => {
      if (typeof nativeModule.start === 'function') {
        try {
          await nativeModule.start();
          if (!cancelled) {
            setMode('native');
          }
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[TunePlay] Failed to start TunePlayAudioModule', error);
          }
          setMode('simulated');
        }
      } else {
        setMode('native');
      }
    };

    if (Platform.OS !== 'android') {
      // On iOS and other platforms we can kick off the async start immediately.
      startNativeModule();
    } else {
      // Android occasionally needs an extra frame before the bridge is ready.
      const handle = setTimeout(() => {
        startNativeModule();
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(handle);
        if (typeof nativeModule.stop === 'function') {
          nativeModule.stop();
        }
      };
    }

    return () => {
      cancelled = true;
      if (typeof nativeModule.stop === 'function') {
        nativeModule.stop();
      }
    };
  }, [enabled]);

  // Synthesize gentle motion for the tuner surface while the real DSP pipeline
  // is offline. These effects are identical to the previous `useFakeTuner`
  // helper so designers retain the same visual cues.
  useEffect(() => {
    if (!enabled) {
      setNoteIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setNoteIndex((current) => (current + 1) % SAMPLE_NOTES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCents(0);
      setEnergy(0);
      return;
    }

    const tick = setInterval(() => {
      const now = Date.now() / 480;
      const sine = Math.sin(now);
      setCents(Math.round(sine * 35));
      setEnergy(Math.abs(Math.cos(now)));
    }, 120);

    return () => clearInterval(tick);
  }, [enabled]);

  const currentNote = SAMPLE_NOTES[noteIndex];

  const snapshot = useMemo<PitchDetectionSnapshot>(() => {
    const locked = Math.abs(cents) <= 3 && energy > 0.6;
    return {
      note: currentNote.name,
      frequency: currentNote.frequency,
      cents,
      energy,
      locked
    };
  }, [currentNote.frequency, currentNote.name, cents, energy]);

  return {
    snapshot: enabled ? snapshot : DEFAULT_SNAPSHOT,
    isNativeModuleAvailable: nativeModuleRef.current != null,
    mode: enabled ? mode : 'simulated'
  };
};

export default usePitchDetection;
