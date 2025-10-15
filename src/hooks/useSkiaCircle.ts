import React from 'react';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

export type CircleCenter = {
  x: number;
  y: number;
};

export type SkiaCircle = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  update: (next: CircleCenter) => void;
};

/**
 * Dedicated hook that encapsulates the mutable Skia values backing the circle center.
 * Extracting this logic keeps rendering components focused purely on layout concerns.
 */
export const useSkiaCircle = (initial: CircleCenter): SkiaCircle => {
  const x = useSharedValue(initial.x);
  const y = useSharedValue(initial.y);

  const update = React.useCallback(
    (next: CircleCenter) => {
      x.value = next.x;
      y.value = next.y;
    },
    [x, y]
  );

  return { x, y, update };
};
