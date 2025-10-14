import React from 'react';

import { midiToNoteName } from '../utils/music';
import type { NoteName } from '../utils/music';
import type { SpringState } from '../utils/spring';

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
  sensitivityMode: 'gentle' | 'standard' | 'aggressive';
  lockThreshold: number;
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
    sensitivityMode: 'standard',
    lockThreshold: 5
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
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload }
      };
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
