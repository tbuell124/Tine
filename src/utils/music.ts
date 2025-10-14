/**
 * Utility helpers for musical note and pitch visualisation conversions.
 */

/** Degrees between adjacent semitone steps on the tuning dial. */
export const NOTE_STEP_DEG = 30;

/** Number of degrees the dial should rotate per cent of detuning. */
export const DEG_PER_CENT = 3;

/** Maximum absolute cents we expect to visualise (±50¢ → ±150°). */
export const MAX_DISPLAY_CENTS = 50;

/** Maximum rotation from the neutral position in degrees. */
export const MAX_DISPLAY_DEG = MAX_DISPLAY_CENTS * DEG_PER_CENT;

/**
 * Canonical sharp note names for each semitone in an octave starting at C.
 */
const NOTE_NAMES_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/**
 * Canonical flat note names for each semitone in an octave starting at C.
 */
const NOTE_NAMES_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

/** Type representing the preferred accidental spelling for note names. */
export type AccidentalPreference = "sharp" | "flat";

/**
 * Converts a MIDI note number to its canonical name with octave.
 *
 * @param midiNumber MIDI note number (0-127) according to the MIDI spec.
 * @param accidental Preference for sharp or flat spelling of enharmonic notes.
 * @returns Note name including octave (e.g. "A4").
 */
export function midiToNoteName(
  midiNumber: number,
  accidental: AccidentalPreference = "sharp"
): string {
  if (!Number.isFinite(midiNumber)) {
    throw new TypeError("midiNumber must be a finite number");
  }

  const octave = Math.floor(midiNumber / 12) - 1;
  const noteIndex = ((midiNumber % 12) + 12) % 12; // Guard against negative input.

  const noteName =
    accidental === "flat"
      ? NOTE_NAMES_FLAT[noteIndex]
      : NOTE_NAMES_SHARP[noteIndex];

  return `${noteName}${octave}`;
}

/**
 * Returns both flat and sharp spellings for a MIDI note number.
 *
 * @param midiNumber MIDI note number (0-127).
 * @returns Object with both sharp and flat spellings.
 */
export function midiToEnharmonicNames(midiNumber: number): {
  sharp: string;
  flat: string;
} {
  return {
    sharp: midiToNoteName(midiNumber, "sharp"),
    flat: midiToNoteName(midiNumber, "flat"),
  };
}

/**
 * Converts a cents offset to a rotation in degrees for display purposes.
 *
 * @param cents Difference from concert pitch in cents. Positive values
 *              indicate the note is sharp, negative values flat.
 * @param clamp Whether to clamp the resulting angle to the display limits.
 * @returns Angle in degrees that should be applied to the dial/needle.
 */
export function centsToDegrees(cents: number, clamp = true): number {
  if (!Number.isFinite(cents)) {
    throw new TypeError("cents must be a finite number");
  }

  const rawDegrees = cents * DEG_PER_CENT;

  if (!clamp) {
    return rawDegrees;
  }

  if (rawDegrees > MAX_DISPLAY_DEG) {
    return MAX_DISPLAY_DEG;
  }

  if (rawDegrees < -MAX_DISPLAY_DEG) {
    return -MAX_DISPLAY_DEG;
  }

  return rawDegrees;
}
