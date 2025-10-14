import React from 'react';

type GestureHandlers = {
  onBegin?: (event: any) => void;
  onUpdate?: (event: any) => void;
  onFinalize?: (event: any) => void;
};

type MockGesture = {
  type: 'pan' | 'pinch';
  handlers: GestureHandlers;
  maxPointers: jest.MockedFunction<(maxPointers: number) => MockGesture>;
  onBegin: jest.MockedFunction<(cb: (event: any) => void) => MockGesture>;
  onUpdate: jest.MockedFunction<(cb: (event: any) => void) => MockGesture>;
  onFinalize: jest.MockedFunction<(cb: () => void) => MockGesture>;
};

const gestures: MockGesture[] = [];

const createGesture = (type: 'pan' | 'pinch'): MockGesture => {
  const handlers: GestureHandlers = {};

  const gesture: Partial<MockGesture> = {
    type,
    handlers,
  };

  const chain = (cbKey: keyof GestureHandlers) => (cb: (event: any) => void) => {
    handlers[cbKey] = cb;
    return gesture as MockGesture;
  };

  (gesture as MockGesture).maxPointers = jest.fn(() => gesture as MockGesture);
  (gesture as MockGesture).onBegin = jest.fn(chain('onBegin'));
  (gesture as MockGesture).onUpdate = jest.fn(chain('onUpdate'));
  (gesture as MockGesture).onFinalize = jest.fn((cb: () => void) => {
    handlers.onFinalize = cb;
    return gesture as MockGesture;
  });

  gestures.push(gesture as MockGesture);
  return gesture as MockGesture;
};

export const Gesture = {
  Pan: () => createGesture('pan'),
  Pinch: () => createGesture('pinch'),
};

export const GestureDetector: React.FC<{ gesture: MockGesture; children: React.ReactNode }> & {
  __TEST__?: {
    gestures: MockGesture[];
    reset: () => void;
  };
} = ({ children }) => <>{children}</>;

GestureDetector.__TEST__ = {
  gestures,
  reset: () => {
    gestures.splice(0, gestures.length);
  },
};

export const __TEST__ = GestureDetector.__TEST__;

export default {
  Gesture,
  GestureDetector,
};
