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

/** Minimum and maximum valid MIDI note numbers according to the spec. */
export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

/**
 * Canonical sharp note names for each semitone in an octave starting at C.
 */
const NOTE_NAMES_SHARP = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/**
 * Canonical flat note names for each semitone in an octave starting at C.
 */
const NOTE_NAMES_FLAT = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

/** Preferred accidental spelling for note names. */
export type AccidentalPreference = 'sharp' | 'flat';

/** String template that reflects the `{pitchClass}{octave}` note representation. */
export type NoteName = `${
  | (typeof NOTE_NAMES_SHARP)[number]
  | (typeof NOTE_NAMES_FLAT)[number]
}${number}`;

/**
 * Normalises the raw MIDI value into the legal 0-127 range after rounding to the
 * nearest integer. Pitch detectors can yield fractional values, so we round to
 * the closest semitone before mapping to note names.
 */
function normaliseMidi(midiNumber: number): number {
  if (!Number.isFinite(midiNumber)) {
    throw new TypeError('midiNumber must be a finite number');
  }

  const rounded = Math.round(midiNumber);
  return Math.min(MIDI_MAX, Math.max(MIDI_MIN, rounded));
}

/**
 * Converts a MIDI note number to its canonical name with octave.
 *
 * @param midiNumber MIDI note number (0-127) according to the MIDI spec.
 * @param accidental Preference for sharp or flat spelling of enharmonic notes.
 * @returns Note name including octave (e.g. "A4").
 */
export function midiToNoteName(
  midiNumber: number,
  accidental: AccidentalPreference = 'sharp',
): NoteName {
  const midi = normaliseMidi(midiNumber);
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = ((midi % 12) + 12) % 12; // Guard against negative values before clamping.

  const noteName =
    accidental === 'flat'
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
  sharp: NoteName;
  flat: NoteName;
} {
  return {
    sharp: midiToNoteName(midiNumber, 'sharp'),
    flat: midiToNoteName(midiNumber, 'flat'),
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
    throw new TypeError('cents must be a finite number');
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

/**
 * Converts a dial rotation in degrees back to cents for DSP loops that operate
 * in the frequency domain. Mirrors {@link centsToDegrees} and therefore
 * supports optional clamping.
 */
export function degreesToCents(degrees: number, clamp = true): number {
  if (!Number.isFinite(degrees)) {
    throw new TypeError('degrees must be a finite number');
  }

  const rawCents = degrees / DEG_PER_CENT;

  if (!clamp) {
    return rawCents;
  }

  if (rawCents > MAX_DISPLAY_CENTS) {
    return MAX_DISPLAY_CENTS;
  }

  if (rawCents < -MAX_DISPLAY_CENTS) {
    return -MAX_DISPLAY_CENTS;
  }

  return rawCents;
}
