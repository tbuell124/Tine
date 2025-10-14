import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { midiToNoteName } from '../utils/music';
import type { NoteName } from '../utils/music';
import type { SpringState } from '../utils/spring';

const SENSITIVITY_OPTIONS = [25, 50, 100] as const;
export type SensitivityRange = (typeof SENSITIVITY_OPTIONS)[number];

const A4_MIN = 415;
const A4_MAX = 466;
const LOCK_THRESHOLD_MIN = 1;
const LOCK_THRESHOLD_MAX = 8;
const LOCK_DWELL_MIN = 0.2;
const LOCK_DWELL_MAX = 1.5;
const SETTINGS_STORAGE_KEY = 'tine:tunerSettings';

/**
 * Describes the currently detected pitch along with any metadata that the UI
 * needs for display or downstream calculations.
 */
export interface PitchState {
  midi: number | null;
  cents: number;
  noteName: NoteName | null;
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
}

type TunerAction =
  | { type: 'SET_PITCH'; payload: Partial<PitchState> }
  | { type: 'SET_ANGLES'; payload: Partial<AngleState> }
  | { type: 'SET_SPRING'; payload: Partial<SpringRuntimeState> }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<TunerSettings> }
  | { type: 'RESET' };

const DEFAULT_A4_MIDI = 69;

type PersistentSettings = Pick<
  TunerSettings,
  'a4Calibration' | 'sensitivityRange' | 'lockThreshold' | 'lockDwellTime'
>;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normaliseSettingsPayload = (payload: Partial<TunerSettings>): Partial<TunerSettings> => {
  const result: Partial<TunerSettings> = {};

  if (payload.a4Calibration !== undefined) {
    const calibrated = Math.round(payload.a4Calibration);
    result.a4Calibration = clampNumber(calibrated, A4_MIN, A4_MAX);
  }

  if (payload.sensitivityRange !== undefined) {
    if (SENSITIVITY_OPTIONS.includes(payload.sensitivityRange as SensitivityRange)) {
      result.sensitivityRange = payload.sensitivityRange as SensitivityRange;
    }
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
  lockThreshold: settings.lockThreshold,
  lockDwellTime: settings.lockDwellTime
});

const initialState: TunerState = {
  pitch: {
    midi: DEFAULT_A4_MIDI,
    cents: 0,
    noteName: midiToNoteName(DEFAULT_A4_MIDI)
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
    sensitivityRange: 50,
    lockThreshold: 2,
    lockDwellTime: 0.4,
    manualMode: false
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

      if (
        action.payload.midi !== undefined &&
        action.payload.noteName === undefined
      ) {
        nextPitch.noteName =
          action.payload.midi === null
            ? null
            : midiToNoteName(action.payload.midi);
      }

      return {
        ...state,
        pitch: nextPitch
      };
    }
    case 'SET_ANGLES':
      return {
        ...state,
        angles: { ...state.angles, ...action.payload }
      };
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
    case 'RESET':
      return {
        ...initialState,
        pitch: { ...initialState.pitch },
        angles: { ...initialState.angles },
        spring: { ...initialState.spring },
        settings: { ...initialState.settings }
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
  const hasHydratedSettingsRef = React.useRef(false);

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
  }, [dispatch]);

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
      }
    };

    void persistSettings();
  }, [state.settings]);

  return (
    <TunerStateContext.Provider value={state}>
      <TunerDispatchContext.Provider value={dispatch}>{children}</TunerDispatchContext.Provider>
    </TunerStateContext.Provider>
  );
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
      setAngles: (angles: Partial<AngleState>) =>
        dispatch({ type: 'SET_ANGLES', payload: angles }),
      setSpring: (spring: Partial<SpringRuntimeState>) =>
        dispatch({ type: 'SET_SPRING', payload: spring }),
      updateSettings: (settings: Partial<TunerSettings>) =>
        dispatch({ type: 'UPDATE_SETTINGS', payload: settings }),
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
