import React from 'react';

/**
 * Describes the currently detected pitch along with any metadata that the UI
 * needs for display or downstream calculations.
 */
export interface PitchState {
  midi: number | null;
  cents: number;
  noteName: string;
}

/**
 * Represents the rotational state of the outer and inner dials that make up the
 * tuner UI.
 */
export interface AngleState {
  outer: number;
  inner: number;
}

/**
 * Tracks the velocity of the primary spring animation so gesture handlers and
 * animations can stay in sync.
 */
export interface SpringVelocityState {
  current: number;
  target: number;
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
  springVelocity: SpringVelocityState;
  settings: TunerSettings;
}

type TunerAction =
  | { type: 'SET_PITCH'; payload: Partial<PitchState> }
  | { type: 'SET_ANGLES'; payload: Partial<AngleState> }
  | { type: 'SET_SPRING_VELOCITY'; payload: Partial<SpringVelocityState> }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<TunerSettings> }
  | { type: 'RESET' };

const initialState: TunerState = {
  pitch: {
    midi: null,
    cents: 0,
    noteName: 'A4'
  },
  angles: {
    outer: 0,
    inner: 0
  },
  springVelocity: {
    current: 0,
    target: 0
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
    case 'SET_PITCH':
      return {
        ...state,
        pitch: { ...state.pitch, ...action.payload }
      };
    case 'SET_ANGLES':
      return {
        ...state,
        angles: { ...state.angles, ...action.payload }
      };
    case 'SET_SPRING_VELOCITY':
      return {
        ...state,
        springVelocity: { ...state.springVelocity, ...action.payload }
      };
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload }
      };
    case 'RESET':
      return initialState;
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
      setSpringVelocity: (springVelocity: Partial<SpringVelocityState>) =>
        dispatch({ type: 'SET_SPRING_VELOCITY', payload: springVelocity }),
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
