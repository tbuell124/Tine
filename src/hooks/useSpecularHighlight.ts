import { useMemo } from "react";

import { useDeviceTilt } from "./useDeviceTilt";

const TWO_PI = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const wrapAngle = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  let wrapped = value % TWO_PI;
  if (wrapped < 0) {
    wrapped += TWO_PI;
  }
  return wrapped;
};

export interface SpecularHighlightOptions {
  baseAngle?: number;
  minWidth?: number;
  maxWidth?: number;
  minIntensity?: number;
  maxIntensity?: number;
  tiltReference?: number;
}

export interface SpecularHighlightState {
  localAngle: number;
  worldAngle: number;
  width: number;
  intensity: number;
  tiltStrength: number;
}

export const useSpecularHighlight = (
  rotation: number,
  {
    baseAngle = -Math.PI / 2,
    minWidth = 0.07,
    maxWidth = 0.18,
    minIntensity = 0.35,
    maxIntensity = 0.95,
    tiltReference = 0.75,
  }: SpecularHighlightOptions = {},
): SpecularHighlightState => {
  const tilt = useDeviceTilt();

  return useMemo(() => {
    const tiltStrength = clamp(tilt.planarMagnitude / tiltReference, 0, 1);
    const width = maxWidth - tiltStrength * (maxWidth - minWidth);
    const intensity = minIntensity + tiltStrength * (maxIntensity - minIntensity);
    const worldAngle = wrapAngle(baseAngle + tilt.horizontalAngle);
    const localAngle = wrapAngle(worldAngle - rotation);

    return {
      localAngle,
      worldAngle,
      width,
      intensity,
      tiltStrength,
    };
  }, [baseAngle, maxIntensity, maxWidth, minIntensity, minWidth, rotation, tilt, tiltReference]);
};
