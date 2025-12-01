import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { midiToNoteName } from '../utils/music';
import type { NoteName } from '../utils/music';
import type { SpringState } from '../utils/spring';
import { useNotifications } from './NotificationContext';

export const SENSITIVITY_PRESETS = [
  {
    id: 'low-latency',
    label: 'Low Latency',
    range: 25 as const,
    bufferSize: 512,
    probabilityThreshold: 0.18,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    range: 50 as const,
    bufferSize: 1024,
    probabilityThreshold: 0.14,
  },
  {
    id: 'stable',
    label: 'Stable',
    range: 100 as const,
    bufferSize: 2048,
    probabilityThreshold: 0.1,
  },
] as const;

export type SensitivityRange = (typeof SENSITIVITY_PRESETS)[number]['range'];
export type SensitivityPresetId = (typeof SENSITIVITY_PRESETS)[number]['id'];

const A4_MIN = 415;
const A4_MAX = 466;
const LOCK_THRESHOLD_MIN = 1;
const LOCK_THRESHOLD_MAX = 8;
const LOCK_DWELL_MIN = 0.2;
const LOCK_DWELL_MAX = 1.5;
const SETTINGS_STORAGE_KEY = 'tine:tunerSettings';
const DETECTOR_BUFFER_MIN = 256;
const DETECTOR_BUFFER_MAX = 4096;
const DETECTOR_THRESHOLD_MIN = 0.05;
const DETECTOR_THRESHOLD_MAX = 0.35;

const SIGNAL_RECENT_WINDOW_MS = 220;
const SIGNAL_LISTENING_TIMEOUT_MS = 500;
const SIGNAL_DROPOUT_WINDOW_MS = 320;
const SIGNAL_FREEZE_DURATION_MS = 150;
const SIGNAL_STABLE_CONFIDENCE = 0.68;
const SIGNAL_SEMI_CONFIDENCE = 0.35;
const SIGNAL_NOISE_FLOOR = 0.08;
const LISTENING_DECAY_RATE = 2.8;

/**
 * Describes the currently detected pitch along with any metadata that the UI
 * needs for display or downstream calculations.
 */
export interface PitchState {
  midi: number | null;
  cents: number;
  noteName: NoteName | null;
  /** Confidence score from the detector between 0 (noise) and 1 (perfect). */
  confidence: number;
  /** Timestamp of the most recent detector update (ms since epoch). */
  updatedAt: number;
}

/**
 * Represents the rotational state of the outer and inner dials that make up the
 * tuner UI.
 */
export interface AngleState {
  /** Outer wheel rotation in degrees representing coarse pitch class alignment. */
  outer: number;
  /** Target inner wheel rotation in degrees representing ±50¢ detuning. */
  inner: number;
}

/**
 * Tracks the critically damped spring responsible for smoothing inner dial
 * motion. All angles are stored in radians to align with the physics helper.
 */
export interface SpringRuntimeState extends SpringState {
  /** Target angle (radians) the spring should converge towards. */
  targetAngle: number;
}

/**
 * User-configurable settings that influence the tuner behaviour.
 */
export interface TunerSettings {
  a4Calibration: number;
  sensitivityRange: SensitivityRange;
  sensitivityProfile: SensitivityPresetId;
  lockThreshold: number;
  lockDwellTime: number;
  /** When true the UI enters manual note selection mode and hides live cents readouts. */
  manualMode: boolean;
}

/**
 * Top-level state container for the tuner experience.
 */
export interface TunerState {
  pitch: PitchState;
  angles: AngleState;
  /** Critically damped spring state controlling the smooth inner dial motion. */
  spring: SpringRuntimeState;
  settings: TunerSettings;
  signal: SignalState;
}

export type SignalPhase = 'listening' | 'stabilizing' | 'tracking' | 'dropout';

export interface SignalState {
  /** High level descriptor of the incoming audio state. */
  phase: SignalPhase;
  /** Timestamp of the last phase transition. */
  lastChange: number;
  /** Prevents dial updates while freezing after a dropout (ms since epoch). */
  freezeUntil: number;
  /** Timestamp of the last moment any usable signal was heard. */
  lastHeardAt: number;
}

export interface SetAnglesMeta {
  /** When true bypasses dropout freeze checks and forces the update. */
  force?: boolean;
}

type TunerAction =
  | { type: 'SET_PITCH'; payload: Partial<PitchState> }
  | { type: 'SET_ANGLES'; payload: Partial<AngleState>; meta?: SetAnglesMeta }
  | { type: 'SET_SPRING'; payload: Partial<SpringRuntimeState> }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<TunerSettings> }
  | { type: 'SET_SIGNAL'; payload: Partial<SignalState> }
  | { type: 'RESET' };

const DEFAULT_A4_MIDI = 69;
const DEFAULT_SENSITIVITY_PRESET = SENSITIVITY_PRESETS[1];

type PersistentSettings = Pick<
  TunerSettings,
  | 'a4Calibration'
  | 'sensitivityRange'
  | 'sensitivityProfile'
  | 'lockThreshold'
  | 'lockDwellTime'
>;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampConfidence = (confidence: number): number => {
  if (!Number.isFinite(confidence)) {
    return 0;
  }

  if (confidence <= 0) {
    return 0;
  }

  if (confidence >= 1) {
    return 1;
  }

  return Number(confidence.toFixed(4));
};

const clampBufferSize = (bufferSize: number): number =>
  Math.round(clampNumber(bufferSize, DETECTOR_BUFFER_MIN, DETECTOR_BUFFER_MAX));

const clampDetectorThreshold = (threshold: number): number =>
  parseFloat(
    clampNumber(threshold, DETECTOR_THRESHOLD_MIN, DETECTOR_THRESHOLD_MAX).toFixed(3),
  );

const findPresetById = (id: SensitivityPresetId | undefined) =>
  SENSITIVITY_PRESETS.find((preset) => preset.id === id);

const findPresetByRange = (range: SensitivityRange | undefined) =>
  SENSITIVITY_PRESETS.find((preset) => preset.range === range);

const describeSignalPhase = (phase: SignalPhase): string => {
  switch (phase) {
    case 'listening':
      return '[signal] Listening… awaiting reliable input';
    case 'stabilizing':
      return '[signal] Stabilizing… refining noisy input';
    case 'dropout':
      return '[signal] Dropout detected – freezing display';
    case 'tracking':
    default:
      return '[signal] Tracking pitch with stable lock';
  }
};

const normaliseSettingsPayload = (payload: Partial<TunerSettings>): Partial<TunerSettings> => {
  const result: Partial<TunerSettings> = {};
  let resolvedPreset =
    payload.sensitivityProfile !== undefined
      ? findPresetById(payload.sensitivityProfile)
      : undefined;

  if (payload.a4Calibration !== undefined) {
    const calibrated = Math.round(payload.a4Calibration);
    result.a4Calibration = clampNumber(calibrated, A4_MIN, A4_MAX);
  }

  if (payload.sensitivityRange !== undefined) {
    const matchedPreset = findPresetByRange(payload.sensitivityRange as SensitivityRange);
    if (matchedPreset) {
      resolvedPreset = matchedPreset;
    }
  }

  if (payload.sensitivityProfile !== undefined && !resolvedPreset) {
    resolvedPreset = DEFAULT_SENSITIVITY_PRESET;
  }

  if (resolvedPreset) {
    result.sensitivityRange = resolvedPreset.range;
    result.sensitivityProfile = resolvedPreset.id;
  }

  if (payload.lockThreshold !== undefined) {
    result.lockThreshold = Number.isFinite(payload.lockThreshold)
      ? parseFloat(
          clampNumber(payload.lockThreshold, LOCK_THRESHOLD_MIN, LOCK_THRESHOLD_MAX).toFixed(2)
        )
      : initialState.settings.lockThreshold;
  }

  if (payload.lockDwellTime !== undefined) {
    result.lockDwellTime = Number.isFinite(payload.lockDwellTime)
      ? parseFloat(
          clampNumber(payload.lockDwellTime, LOCK_DWELL_MIN, LOCK_DWELL_MAX).toFixed(2)
        )
      : initialState.settings.lockDwellTime;
  }

  if (payload.manualMode !== undefined) {
    result.manualMode = payload.manualMode;
  }

  return result;
};

const extractPersistentSettings = (settings: TunerSettings): PersistentSettings => ({
  a4Calibration: settings.a4Calibration,
  sensitivityRange: settings.sensitivityRange,
  sensitivityProfile: settings.sensitivityProfile,
  lockThreshold: settings.lockThreshold,
  lockDwellTime: settings.lockDwellTime
});

export const resolveSensitivityPreset = (
  settings: TunerSettings,
): (typeof SENSITIVITY_PRESETS)[number] => {
  const presetById = findPresetById(settings.sensitivityProfile);
  if (presetById) {
    return presetById;
  }

  const presetByRange = findPresetByRange(settings.sensitivityRange);
  if (presetByRange) {
    return presetByRange;
  }

  return DEFAULT_SENSITIVITY_PRESET;
};

export const getDetectorOptionsForSettings = (settings: TunerSettings) => {
  const preset = resolveSensitivityPreset(settings);

  return {
    bufferSize: clampBufferSize(preset.bufferSize),
    threshold: clampDetectorThreshold(preset.probabilityThreshold),
  };
};

const initialState: TunerState = {
  pitch: {
    midi: DEFAULT_A4_MIDI,
    cents: 0,
    noteName: midiToNoteName(DEFAULT_A4_MIDI),
    confidence: 0,
    updatedAt: 0
  },
  angles: {
    outer: 0,
    inner: 0
  },
  spring: {
    angle: 0,
    velocity: 0,
    targetAngle: 0
  },
  settings: {
    a4Calibration: 440,
    sensitivityRange: DEFAULT_SENSITIVITY_PRESET.range,
    sensitivityProfile: DEFAULT_SENSITIVITY_PRESET.id,
    lockThreshold: 2,
    lockDwellTime: 0.4,
    manualMode: false
  },
  signal: {
    phase: 'listening',
    lastChange: Date.now(),
    freezeUntil: 0,
    lastHeardAt: 0
  }
};

const TunerStateContext = React.createContext<TunerState | undefined>(undefined);
const TunerDispatchContext = React.createContext<React.Dispatch<TunerAction> | undefined>(
  undefined
);

function tunerReducer(state: TunerState, action: TunerAction): TunerState {
  switch (action.type) {
    case 'SET_PITCH': {
      const nextPitch = { ...state.pitch, ...action.payload };

      if (action.payload.confidence !== undefined) {
        nextPitch.confidence = clampConfidence(action.payload.confidence);
      }

      const providedMidi = action.payload.midi;
      const providedNote = action.payload.noteName;

      if (providedMidi !== undefined && providedNote === undefined) {
        nextPitch.noteName = providedMidi === null ? null : midiToNoteName(providedMidi);
      }

      if (providedMidi === null) {
        nextPitch.noteName = null;
      }

      if (providedMidi !== undefined || action.payload.cents !== undefined || action.payload.confidence !== undefined) {
        nextPitch.updatedAt = action.payload.updatedAt ?? Date.now();
      }

      return {
        ...state,
        pitch: nextPitch
      };
    }
    case 'SET_ANGLES': {
      const now = Date.now();
      if (
        !action.meta?.force &&
        state.signal.phase === 'dropout' &&
        state.signal.freezeUntil > now
      ) {
        return state;
      }

      return {
        ...state,
        angles: { ...state.angles, ...action.payload }
      };
    }
    case 'SET_SPRING':
      return {
        ...state,
        spring: { ...state.spring, ...action.payload }
      };
    case 'UPDATE_SETTINGS': {
      const nextSettings = normaliseSettingsPayload(action.payload);
      return {
        ...state,
        settings: { ...state.settings, ...nextSettings }
      };
    }
    case 'SET_SIGNAL':
      return {
        ...state,
        signal: { ...state.signal, ...action.payload }
      };
    case 'RESET':
      return {
        ...initialState,
        pitch: { ...initialState.pitch },
        angles: { ...initialState.angles },
        spring: { ...initialState.spring },
        settings: { ...initialState.settings },
        signal: { ...initialState.signal }
      };
    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

export interface TunerProviderProps {
  children: React.ReactNode;
}

/**
 * Provides the tuner state and dispatch to the entire React tree.
 */
export const TunerProvider: React.FC<TunerProviderProps> = ({ children }) => {
  const [state, dispatch] = React.useReducer(tunerReducer, initialState);
  const { showNotification } = useNotifications();
  const hasHydratedSettingsRef = React.useRef(false);
  const pitchRef = React.useRef(state.pitch);
  const signalRef = React.useRef(state.signal);
  const anglesRef = React.useRef(state.angles);
  const lastReliableAtRef = React.useRef<number | null>(null);
  const dropoutTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    pitchRef.current = state.pitch;
  }, [state.pitch]);

  React.useEffect(() => {
    signalRef.current = state.signal;
  }, [state.signal]);

  React.useEffect(() => {
    anglesRef.current = state.angles;
  }, [state.angles]);

  React.useEffect(() => {
    let isMounted = true;

    const hydrateSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored) as Partial<PersistentSettings> | null;
        if (parsed && typeof parsed === 'object') {
          if (isMounted) {
            hasHydratedSettingsRef.current = true;
          }
          dispatch({ type: 'UPDATE_SETTINGS', payload: parsed });
          return;
        }
      } catch (error) {
        console.warn('Failed to restore tuner settings from storage:', error);
        showNotification({
          message:
            'Unable to load saved tuner settings. Defaults were applied; try reopening the app.',
        });
      } finally {
        if (isMounted) {
          hasHydratedSettingsRef.current = true;
        }
      }
    };

    void hydrateSettings();

    return () => {
      isMounted = false;
    };
  }, [dispatch, showNotification]);

  React.useEffect(() => {
    if (!hasHydratedSettingsRef.current) {
      return;
    }

    const persistSettings = async () => {
      try {
        const payload = extractPersistentSettings(state.settings);
        await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to persist tuner settings:', error);
        showNotification({
          message: 'Saving settings failed. Your changes may not persist—please try again.',
        });
      }
    };

    void persistSettings();
  }, [state.settings, showNotification]);

  React.useEffect(() => {
    const pitch = pitchRef.current;
    const signal = signalRef.current;
    const now = Date.now();

    if (state.settings.manualMode) {
      if (dropoutTimeoutRef.current) {
        clearTimeout(dropoutTimeoutRef.current);
        dropoutTimeoutRef.current = null;
      }
      if (signal.phase !== 'tracking' || signal.freezeUntil !== 0) {
        dispatch({
          type: 'SET_SIGNAL',
          payload: {
            phase: 'tracking',
            freezeUntil: 0,
            lastHeardAt: now,
            lastChange: now,
          },
        });
        console.log(describeSignalPhase('tracking'));
      }
      lastReliableAtRef.current = now;
      return;
    }

    const updatedAt = pitch.updatedAt;
    const confidence = clampConfidence(pitch.confidence);
    const hasRecentUpdate = updatedAt > 0 && now - updatedAt <= SIGNAL_RECENT_WINDOW_MS;
    const hasPitch = pitch.midi !== null;
    const hasSignal = hasRecentUpdate && confidence > SIGNAL_NOISE_FLOOR;

    let nextPhase = signal.phase;
    let freezeUntil = signal.freezeUntil;
    let lastHeardAt = signal.lastHeardAt;
    const freezeActive = signal.phase === 'dropout' && freezeUntil > now;

    if (hasSignal && updatedAt > lastHeardAt) {
      lastHeardAt = updatedAt;
    }

    const isReliable = hasRecentUpdate && hasPitch && confidence >= SIGNAL_STABLE_CONFIDENCE;
    const isSemiReliable = hasRecentUpdate && hasPitch && confidence >= SIGNAL_SEMI_CONFIDENCE;

    if (isReliable) {
      lastReliableAtRef.current = updatedAt;
    }

    if (freezeActive) {
      if (lastHeardAt !== signal.lastHeardAt) {
        dispatch({ type: 'SET_SIGNAL', payload: { lastHeardAt } });
      }
      return;
    }

    if (isReliable) {
      nextPhase = 'tracking';
      freezeUntil = 0;
    } else if (isSemiReliable) {
      nextPhase = 'stabilizing';
      freezeUntil = 0;
    } else {
      const lastReliable = lastReliableAtRef.current;
      const recentlyReliable =
        lastReliable !== null && now - lastReliable <= SIGNAL_DROPOUT_WINDOW_MS;

      if (recentlyReliable && (!hasRecentUpdate || !hasPitch)) {
        nextPhase = 'dropout';
        freezeUntil = now + SIGNAL_FREEZE_DURATION_MS;
      } else {
        const silenceDuration = lastHeardAt > 0 ? now - lastHeardAt : Infinity;
        if (!hasSignal && silenceDuration >= SIGNAL_LISTENING_TIMEOUT_MS) {
          nextPhase = 'listening';
          freezeUntil = 0;
        } else if (hasSignal) {
          nextPhase = 'stabilizing';
          freezeUntil = 0;
        } else {
          nextPhase = 'listening';
          freezeUntil = 0;
        }
      }
    }

    const phaseChanged = nextPhase !== signal.phase;
    const freezeChanged = freezeUntil !== signal.freezeUntil;
    const heardChanged = lastHeardAt !== signal.lastHeardAt;

    if (phaseChanged || freezeChanged || heardChanged) {
      dispatch({
        type: 'SET_SIGNAL',
        payload: {
          phase: nextPhase,
          freezeUntil,
          lastHeardAt,
          lastChange: phaseChanged ? now : signal.lastChange,
        },
      });

      if (phaseChanged) {
        console.log(describeSignalPhase(nextPhase));

        if (nextPhase === 'dropout') {
          if (dropoutTimeoutRef.current) {
            clearTimeout(dropoutTimeoutRef.current);
          }
          dropoutTimeoutRef.current = setTimeout(() => {
            const latestSignal = signalRef.current;
            if (latestSignal.phase !== 'dropout') {
              return;
            }

            if (latestSignal.freezeUntil > Date.now()) {
              return;
            }

            dispatch({
              type: 'SET_SIGNAL',
              payload: {
                phase: 'listening',
                freezeUntil: 0,
                lastChange: Date.now(),
                lastHeardAt: latestSignal.lastHeardAt,
              },
            });
          }, SIGNAL_FREEZE_DURATION_MS);
        } else if (dropoutTimeoutRef.current) {
          clearTimeout(dropoutTimeoutRef.current);
          dropoutTimeoutRef.current = null;
        }
      }
    }
  }, [state.pitch, state.signal, state.settings.manualMode, dispatch]);

  React.useEffect(() => {
    if (state.settings.manualMode) {
      return;
    }

    if (state.signal.phase !== 'listening') {
      return;
    }

    let isMounted = true;
    let frame: number | null = null;
    let lastTimestamp: number | null = null;

    const tick = (timestamp: number) => {
      if (!isMounted) {
        return;
      }

      if (signalRef.current.phase !== 'listening') {
        return;
      }

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        frame = requestAnimationFrame(tick);
        return;
      }

      const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;

      const { outer, inner } = anglesRef.current;

      if (Math.abs(outer) < 0.05 && Math.abs(inner) < 0.05) {
        if (outer !== 0 || inner !== 0) {
          dispatch({
            type: 'SET_ANGLES',
            payload: { outer: 0, inner: 0 },
            meta: { force: true },
          });
        }
        frame = requestAnimationFrame(tick);
        return;
      }

      const decay = Math.exp(-deltaTime * LISTENING_DECAY_RATE);
      const nextOuter = outer * decay;
      const nextInner = inner * decay;

      if (Math.abs(nextOuter - outer) < 0.01 && Math.abs(nextInner - inner) < 0.01) {
        frame = requestAnimationFrame(tick);
        return;
      }

      dispatch({
        type: 'SET_ANGLES',
        payload: { outer: nextOuter, inner: nextInner },
        meta: { force: true },
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      isMounted = false;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [state.signal.phase, state.settings.manualMode, dispatch]);

  React.useEffect(() => {
    return () => {
      if (dropoutTimeoutRef.current) {
        clearTimeout(dropoutTimeoutRef.current);
        dropoutTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <TunerStateContext.Provider value={state}>
      <TunerDispatchContext.Provider value={dispatch}>{children}</TunerDispatchContext.Provider>
    </TunerStateContext.Provider>
  );
};

export const __testing = {
  tunerReducer,
  initialState,
  normaliseSettingsPayload,
};

/**
 * Convenience hook that exposes the current tuner state object.
 */
export function useTunerState(): TunerState {
  const context = React.useContext(TunerStateContext);
  if (!context) {
    throw new Error('useTunerState must be used within a TunerProvider');
  }

  return context;
}

/**
 * Convenience hook that exposes memoised setter helpers for the tuner state.
 */
export function useTunerActions() {
  const dispatch = React.useContext(TunerDispatchContext);
  if (!dispatch) {
    throw new Error('useTunerActions must be used within a TunerProvider');
  }

  return React.useMemo(
    () => ({
      setPitch: (pitch: Partial<PitchState>) => dispatch({ type: 'SET_PITCH', payload: pitch }),
      setAngles: (angles: Partial<AngleState>, meta?: SetAnglesMeta) =>
        dispatch({ type: 'SET_ANGLES', payload: angles, meta }),
      setSpring: (spring: Partial<SpringRuntimeState>) =>
        dispatch({ type: 'SET_SPRING', payload: spring }),
      updateSettings: (settings: Partial<TunerSettings>) =>
        dispatch({ type: 'UPDATE_SETTINGS', payload: settings }),
      setSignal: (signal: Partial<SignalState>) =>
        dispatch({ type: 'SET_SIGNAL', payload: signal }),
      reset: () => dispatch({ type: 'RESET' })
    }),
    [dispatch]
  );
}

/**
 * Hook that bundles both state and actions for ergonomic consumption at call
 * sites.
 */
export function useTuner() {
  const state = useTunerState();
  const actions = useTunerActions();

  return React.useMemo(
    () => ({
      state,
      actions
    }),
    [state, actions]
  );
}
