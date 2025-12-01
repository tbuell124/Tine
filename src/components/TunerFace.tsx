import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { runOnJS, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { SENSITIVITY_PRESETS, useTuner } from "@state/TunerStateContext";
import { usePitchLock } from "@hooks/usePitchLock";
import {
  DEG_PER_CENT,
  MAX_DISPLAY_DEG,
  NOTE_STEP_DEG,
  midiToEnharmonicNames,
  midiToNoteName,
  MIDI_MAX,
  MIDI_MIN,
} from "@utils/music";
import stepSpring from "@utils/spring";
import { InnerWheel } from "./InnerWheel";
import { OuterWheel } from "./OuterWheel";
import { IndexIndicator, DEFAULT_INDICATOR_TINT } from "./IndexIndicator";

const DEFAULT_SIZE = 320;
const INNER_WHEEL_RATIO = 220 / 320; // Mirrors the defaults declared inside the wheel components.
const DETENT_CENTS = 5;
const DETENT_STEP_DEGREES = DETENT_CENTS * DEG_PER_CENT;
const EPSILON = 1e-4;
const DEFAULT_A4_MIDI = 69;
const SENSITIVITY_OPTIONS = SENSITIVITY_PRESETS.map((preset) => preset.range);

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;
const radToDeg = (radians: number): number => (radians * 180) / Math.PI;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const normaliseRadians = (value: number): number => {
  const mod = value % (Math.PI * 2);
  if (mod > Math.PI) {
    return mod - Math.PI * 2;
  }
  if (mod < -Math.PI) {
    return mod + Math.PI * 2;
  }
  return mod;
};

export type DetentDirection = "sharp" | "flat";

export interface DetentEvent {
  /** Direction of travel relative to concert pitch. */
  direction: DetentDirection;
  /** The detent value in cents that was crossed. */
  cents: number;
  /** Equivalent angular rotation in degrees for reference. */
  angle: number;
}

export interface TunerFaceProps {
  /**
   * Overall diameter of the tuner stack. Child wheels scale proportionally.
   */
  size?: number;
  /** Optional style applied to the outer wrapper view. */
  style?: StyleProp<ViewStyle>;
  /**
   * Callback fired whenever the smoothed cents wheel crosses a 5¢ detent.
   * Useful for driving haptic feedback without coupling this component
   * directly to a platform-specific API.
   */
  onDetent?: (event: DetentEvent) => void;
  /**
   * Overrides the tint colour used by the index indicator overlay.
   */
  indicatorTint?: string;
  /**
   * Surfaces the inner wheel's knurled pegs to visually reinforce detents.
   */
  showDetentPegs?: boolean;
}

/**
 * TunerFace composes the concentric wheels and overlays responsible for the
 * tuner UI, wiring them to the shared tuner state and managing the critically
 * damped spring that keeps the cents wheel feeling responsive yet stable.
 */
export const TunerFace: React.FC<TunerFaceProps> = ({
  size = DEFAULT_SIZE,
  style,
  onDetent,
  indicatorTint: indicatorTintOverride,
  showDetentPegs = true,
}) => {
  const {
    state: { angles, spring, settings, pitch, signal },
    actions,
  } = useTuner();

  const latestStateRef = React.useRef({ angles, pitch, settings, signal });
  React.useEffect(() => {
    latestStateRef.current = { angles, pitch, settings, signal };
  }, [angles, pitch, settings, signal]);

  const outerRotationShared = useSharedValue(angles.outer);
  const manualAccumulatedRotation = useSharedValue(angles.outer);
  const manualPreviousAngle = useSharedValue(0);

  React.useEffect(() => {
    outerRotationShared.value = angles.outer;
    manualAccumulatedRotation.value = angles.outer;
  }, [angles.outer, outerRotationShared, manualAccumulatedRotation]);

  const manualStartRotationRef = React.useRef(angles.outer);
  const manualStartMidiRef = React.useRef(pitch.midi ?? DEFAULT_A4_MIDI);
  const lastManualRotationRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!settings.manualMode) {
      manualStartRotationRef.current = angles.outer;
      manualStartMidiRef.current = pitch.midi ?? DEFAULT_A4_MIDI;
      lastManualRotationRef.current = angles.outer;
    }
  }, [angles.outer, pitch.midi, settings.manualMode]);

  const pinchStartRangeRef = React.useRef(settings.sensitivityRange);
  const pinchActiveRangeRef = React.useRef(settings.sensitivityRange);
  React.useEffect(() => {
    pinchActiveRangeRef.current = settings.sensitivityRange;
  }, [settings.sensitivityRange]);

  const containerStyle = React.useMemo(
    () => [styles.container, { width: size, height: size }, style],
    [size, style],
  );

  const outerRotation = React.useMemo(() => degToRad(angles.outer), [angles.outer]);
  const handleManualBegin = React.useCallback(() => {
    const { angles: latestAngles, pitch: latestPitch } = latestStateRef.current;
    manualStartRotationRef.current = latestAngles.outer;
    manualStartMidiRef.current = latestPitch.midi ?? DEFAULT_A4_MIDI;
    lastManualRotationRef.current = latestAngles.outer;
    actions.updateSettings({ manualMode: true });
  }, [actions]);

  const handleManualRotate = React.useCallback(
    (rotation: number) => {
      const previous = lastManualRotationRef.current;
      if (previous !== null && Math.abs(rotation - previous) < 0.2) {
        return;
      }

      lastManualRotationRef.current = rotation;
      actions.setAngles({ outer: rotation });

      const baseMidi = manualStartMidiRef.current;
      const rotationDelta = rotation - manualStartRotationRef.current;
      const semitoneOffset = Math.round(rotationDelta / NOTE_STEP_DEG);
      const targetMidi = clamp(baseMidi + semitoneOffset, MIDI_MIN, MIDI_MAX);

      actions.setPitch({ midi: targetMidi, cents: 0 });
    },
    [actions],
  );

  const handleManualEnd = React.useCallback(() => {
    const { angles: latestAngles, pitch: latestPitch } = latestStateRef.current;
    manualStartRotationRef.current = latestAngles.outer;
    manualStartMidiRef.current = latestPitch.midi ?? DEFAULT_A4_MIDI;
    lastManualRotationRef.current = latestAngles.outer;
  }, []);

  const handlePinchBegin = React.useCallback(() => {
    pinchStartRangeRef.current = pinchActiveRangeRef.current;
  }, []);

  const handlePinchUpdate = React.useCallback(
    (scale: number) => {
      const startRange = pinchStartRangeRef.current;
      let delta = 0;
      if (scale > 1.12) {
        delta = 1;
      } else if (scale < 0.9) {
        delta = -1;
      }

      if (delta === 0) {
        return;
      }

      const currentRange = pinchActiveRangeRef.current;
      const startIndex = SENSITIVITY_OPTIONS.indexOf(startRange);
      const nextIndex = clamp(startIndex + delta, 0, SENSITIVITY_OPTIONS.length - 1);
      const nextRange = SENSITIVITY_OPTIONS[nextIndex];

      if (nextRange !== currentRange) {
        pinchActiveRangeRef.current = nextRange;
        actions.updateSettings({ sensitivityRange: nextRange });
      }
    },
    [actions],
  );

  const outerDragGesture = React.useMemo(() => {
    const center = size / 2;
    return Gesture.Pan()
      .maxPointers(1)
      .onBegin((event) => {
        const angle = Math.atan2(event.y - center, event.x - center);
        manualPreviousAngle.value = angle;
        manualAccumulatedRotation.value = outerRotationShared.value;
        runOnJS(handleManualBegin)();
      })
      .onUpdate((event) => {
        const angle = Math.atan2(event.y - center, event.x - center);
        const delta = normaliseRadians(angle - manualPreviousAngle.value);
        manualAccumulatedRotation.value += radToDeg(delta);
        manualPreviousAngle.value = angle;
        runOnJS(handleManualRotate)(manualAccumulatedRotation.value);
      })
      .onFinalize(() => {
        manualAccumulatedRotation.value = outerRotationShared.value;
        runOnJS(handleManualEnd)();
      });
  }, [
    size,
    manualAccumulatedRotation,
    manualPreviousAngle,
    outerRotationShared,
    handleManualBegin,
    handleManualRotate,
    handleManualEnd,
  ]);

  const innerPinchGesture = React.useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          runOnJS(handlePinchBegin)();
        })
        .onUpdate((event) => {
          runOnJS(handlePinchUpdate)(event.scale);
        }),
    [handlePinchBegin, handlePinchUpdate],
  );

  const hapticsRef = React.useRef(onDetent);
  React.useEffect(() => {
    hapticsRef.current = onDetent;
  }, [onDetent]);

  const springRef = React.useRef(spring);
  React.useEffect(() => {
    springRef.current = spring;
  }, [spring]);

  const detentTrackerRef = React.useRef<number | null>(null);

  // Maintain a requestAnimationFrame loop that advances the critically damped spring.
  React.useEffect(() => {
    let isMounted = true;
    let frame: number;
    let lastTimestamp: number | null = null;
    const idleMotionRef = { origin: null as number | null };

    const tick = (timestamp: number) => {
      if (!isMounted) {
        return;
      }

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        frame = requestAnimationFrame(tick);
        return;
      }

      const deltaTime = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      const snapshot = latestStateRef.current;
      const baseInner = Math.max(-MAX_DISPLAY_DEG, Math.min(MAX_DISPLAY_DEG, snapshot.angles.inner));
      let targetInner = baseInner;

      if (snapshot.signal.phase === "listening" && !snapshot.settings.manualMode) {
        if (idleMotionRef.origin === null) {
          idleMotionRef.origin = timestamp;
        }

        const elapsed = ((timestamp - idleMotionRef.origin) / 1000) % 1000;
        const waveA = Math.sin(elapsed * 1.2);
        const waveB = Math.sin(elapsed * 0.75 + 1.1);
        const microDegrees = (waveA * 0.6 + waveB * 0.4) * 1.8;
        targetInner = Math.max(
          -MAX_DISPLAY_DEG,
          Math.min(MAX_DISPLAY_DEG, baseInner + microDegrees),
        );
      } else {
        idleMotionRef.origin = null;
      }

      const desiredTarget = degToRad(targetInner);
      const currentSpring = springRef.current;

      if (Math.abs(currentSpring.targetAngle - desiredTarget) > EPSILON) {
        springRef.current = { ...currentSpring, targetAngle: desiredTarget };
        actions.setSpring({ targetAngle: desiredTarget });
      }

      const { angle, velocity, targetAngle } = springRef.current;
      const nextState = stepSpring(angle, targetAngle, velocity, deltaTime);

      const angleDelta = Math.abs(nextState.angle - angle);
      const velocityDelta = Math.abs(nextState.velocity - velocity);

      if (angleDelta > EPSILON || velocityDelta > EPSILON) {
        const previousDegrees = detentTrackerRef.current ?? radToDeg(angle);
        const nextDegrees = radToDeg(nextState.angle);

        // Update detent tracker before scheduling the next frame.
        detentTrackerRef.current = nextDegrees;

        const callback = hapticsRef.current;
        if (callback && previousDegrees !== nextDegrees) {
          if (nextDegrees > previousDegrees) {
            let detent = Math.floor(previousDegrees / DETENT_STEP_DEGREES) * DETENT_STEP_DEGREES + DETENT_STEP_DEGREES;
            while (detent <= nextDegrees) {
              callback({
                angle: detent,
                cents: detent / DEG_PER_CENT,
                direction: "sharp",
              });
              detent += DETENT_STEP_DEGREES;
            }
          } else {
            let detent = Math.ceil(previousDegrees / DETENT_STEP_DEGREES) * DETENT_STEP_DEGREES - DETENT_STEP_DEGREES;
            while (detent >= nextDegrees) {
              callback({
                angle: detent,
                cents: detent / DEG_PER_CENT,
                direction: "flat",
              });
              detent -= DETENT_STEP_DEGREES;
            }
          }
        }

        springRef.current = { ...springRef.current, ...nextState };
        actions.setSpring({ angle: nextState.angle, velocity: nextState.velocity });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      isMounted = false;
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [actions]);

  const innerRotation = springRef.current.angle;

  const baseIndicatorTint = indicatorTintOverride ?? DEFAULT_INDICATOR_TINT;
  const { locked, accentColor: indicatorAccent, status: tuningStatus } = usePitchLock({
    cents: pitch.cents,
    midi: pitch.midi,
    thresholdCents: settings.lockThreshold,
    dwellTimeMs: settings.lockDwellTime * 1000,
  });

  const noteDisplay = React.useMemo(() => {
    const formatStem = (note: string): string => {
      const match = note.match(/^([A-G])([#b]?)/i);
      if (!match) {
        return note;
      }

      const [, letter, accidental] = match;
      const accidentalSymbol = accidental === "#" ? "♯" : accidental === "b" ? "♭" : "";
      return `${letter.toUpperCase()}${accidentalSymbol}`;
    };

    if (pitch.midi === null) {
      return { primary: "—", alternate: null };
    }

    const enharmonic = midiToEnharmonicNames(pitch.midi);
    const preferred = pitch.noteName ?? enharmonic.sharp;
    const primary = formatStem(preferred);
    const alternateCandidate = formatStem(enharmonic.flat);
    const alternate = alternateCandidate !== primary ? alternateCandidate : null;

    return { primary, alternate };
  }, [pitch.midi, pitch.noteName]);

  const manualNoteLabel = React.useMemo(() => {
    if (pitch.noteName) {
      return pitch.noteName;
    }

    if (pitch.midi !== null) {
      return midiToNoteName(pitch.midi);
    }

    return midiToNoteName(DEFAULT_A4_MIDI);
  }, [pitch.noteName, pitch.midi]);

  const innerSize = size * INNER_WHEEL_RATIO;

  return (
    <View style={containerStyle}>
      <GestureDetector gesture={outerDragGesture}>
        <Animated.View style={{ width: size, height: size }}>
          <OuterWheel size={size} rotation={outerRotation} />
        </Animated.View>
      </GestureDetector>
      <View style={[StyleSheet.absoluteFill, styles.centerContent]}>
        <GestureDetector gesture={innerPinchGesture}>
          <Animated.View style={{ width: innerSize, height: innerSize }}>
            <InnerWheel
              size={innerSize}
              rotation={innerRotation}
              showDetentPegs={showDetentPegs}
            />
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <IndexIndicator
          size={size}
          tintColor={baseIndicatorTint}
          accentColor={indicatorAccent}
          locked={locked}
          status={tuningStatus}
        />
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.centerOverlay}>
          {settings.manualMode ? (
            <Text style={styles.manualLabel} accessibilityRole="text">{`Manual ${manualNoteLabel}`}</Text>
          ) : null}
          <Text
            style={[styles.noteGlyph, locked ? { color: indicatorAccent } : null]}
            accessibilityRole="text"
          >
            {noteDisplay.primary}
          </Text>
          {noteDisplay.alternate ? (
            <Text style={styles.alternateLabel} accessibilityRole="text">
              {noteDisplay.alternate}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 16,
  },
  manualLabel: {
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.45)",
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  noteGlyph: {
    color: "#f8fafc",
    fontSize: 88,
    fontWeight: "800",
    letterSpacing: 4,
  },
  alternateLabel: {
    marginTop: 8,
    color: "#94a3b8",
    fontSize: 18,
    letterSpacing: 2,
    fontWeight: "600",
  },
});

export default TunerFace;
