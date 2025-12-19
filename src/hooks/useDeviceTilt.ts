import { Accelerometer, type AccelerometerMeasurement, type Subscription } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const DEFAULT_VECTOR = { x: 0, y: 0, z: -1 };

export interface DeviceTiltState {
  vector: { x: number; y: number; z: number };
  horizontalAngle: number;
  planarMagnitude: number;
  pitch: number;
  roll: number;
}

const defaultState: DeviceTiltState = {
  vector: DEFAULT_VECTOR,
  horizontalAngle: 0,
  planarMagnitude: 0,
  pitch: 0,
  roll: 0,
};

const listeners = new Set<(state: DeviceTiltState) => void>();
let currentState: DeviceTiltState = defaultState;
let accelerometerSubscription: Subscription | null = null;
let isSensorAvailable: boolean | null = null;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normaliseVector = (measurement: AccelerometerMeasurement) => {
  const { x, y, z } = measurement;
  const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;
  return {
    x: x / magnitude,
    y: y / magnitude,
    z: z / magnitude,
  };
};

const calculateState = (measurement: AccelerometerMeasurement): DeviceTiltState => {
  const vector = normaliseVector(measurement);
  const planarMagnitude = clamp(Math.sqrt(vector.x * vector.x + vector.y * vector.y), 0, 1);
  const pitch = Math.atan2(-vector.x, Math.sqrt(vector.y * vector.y + vector.z * vector.z));
  const roll = Math.atan2(vector.y, vector.z);
  const horizontalAngle = planarMagnitude > 0.0001 ? Math.atan2(-vector.y, vector.x) : 0;

  return {
    vector,
    planarMagnitude,
    horizontalAngle,
    pitch,
    roll,
  };
};

const startAccelerometer = async () => {
  if (accelerometerSubscription || Platform.OS === 'web') {
    return;
  }

  if (isSensorAvailable === false) {
    return;
  }

  if (isSensorAvailable === null) {
    try {
      isSensorAvailable = await Accelerometer.isAvailableAsync();
    } catch {
      isSensorAvailable = false;
    }
  }

  if (!isSensorAvailable) {
    return;
  }

  Accelerometer.setUpdateInterval(100);
  accelerometerSubscription = Accelerometer.addListener((measurement) => {
    currentState = calculateState(measurement);
    listeners.forEach((listener) => {
      listener(currentState);
    });
  });
};

const stopAccelerometer = () => {
  accelerometerSubscription?.remove();
  accelerometerSubscription = null;
};

export const useDeviceTilt = (): DeviceTiltState => {
  const [state, setState] = useState<DeviceTiltState>(currentState);

  useEffect(() => {
    const listener = (nextState: DeviceTiltState) => {
      setState(nextState);
    };

    listeners.add(listener);

    if (listeners.size === 1) {
      startAccelerometer().catch(() => {});
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopAccelerometer();
      }
    };
  }, []);

  return state;
};
