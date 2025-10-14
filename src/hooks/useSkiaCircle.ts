import React from 'react';
import { SkiaMutableValue, useValue } from '@shopify/react-native-skia';

export type CircleCenter = {
  x: number;
  y: number;
};

export type SkiaCircle = {
  x: SkiaMutableValue<number>;
  y: SkiaMutableValue<number>;
  update: (next: CircleCenter) => void;
};

/**
 * Dedicated hook that encapsulates the mutable Skia values backing the circle center.
 * Extracting this logic keeps rendering components focused purely on layout concerns.
 */
export const useSkiaCircle = (initial: CircleCenter): SkiaCircle => {
  const x = useValue(initial.x);
  const y = useValue(initial.y);

  const update = React.useCallback(
    (next: CircleCenter) => {
      x.current = next.x;
      y.current = next.y;
    },
    [x, y]
  );

  return { x, y, update };
};
