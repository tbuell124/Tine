export const tuningTheme = {
  tuningStates: {
    far: "#ef4444", // Red for ≥15¢ deviation
    approaching: "#f59e0b", // Amber for 5–15¢ deviation
    near: "#84cc16", // Yellow-green for ≤5¢ deviation
    locked: {
      base: "#059669", // Emerald core when locked
      light: "#34d399",
      dark: "#047857",
    },
  },
} as const;

export type TuningState = "locked" | "near" | "approaching" | "far";

export const TUNING_THRESHOLDS = {
  near: 5,
  approaching: 15,
} as const;

export const resolveTuningState = (cents: number | null, locked: boolean): TuningState => {
  if (locked) {
    return "locked";
  }

  if (cents === null || !Number.isFinite(cents)) {
    return "far";
  }

  const magnitude = Math.abs(cents);

  if (magnitude <= TUNING_THRESHOLDS.near) {
    return "near";
  }

  if (magnitude <= TUNING_THRESHOLDS.approaching) {
    return "approaching";
  }

  return "far";
};

export const tuningStateToColor = (state: TuningState): string => {
  switch (state) {
    case "locked":
      return tuningTheme.tuningStates.locked.base;
    case "near":
      return tuningTheme.tuningStates.near;
    case "approaching":
      return tuningTheme.tuningStates.approaching;
    case "far":
    default:
      return tuningTheme.tuningStates.far;
  }
};
