import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { runOnJS, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useTuner } from "@state/TunerStateContext";
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
const SENSITIVITY_STATES = ["gentle", "standard", "aggressive"] as const;

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
    state: { angles, spring, settings, pitch },
    actions,
  } = useTuner();

  const latestStateRef = React.useRef({ angles, pitch, settings });
  React.useEffect(() => {
    latestStateRef.current = { angles, pitch, settings };
  }, [angles, pitch, settings]);

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

  const pinchStartModeRef = React.useRef(settings.sensitivityMode);
  const pinchActiveModeRef = React.useRef(settings.sensitivityMode);
  React.useEffect(() => {
    pinchActiveModeRef.current = settings.sensitivityMode;
  }, [settings.sensitivityMode]);

  const containerStyle = React.useMemo(
    () => [styles.container, { width: size, height: size }, style],
    [size, style],
  );

  const outerRotation = React.useMemo(() => degToRad(angles.outer), [angles.outer]);
  const targetInnerRadians = React.useMemo(
    () => degToRad(Math.max(-MAX_DISPLAY_DEG, Math.min(MAX_DISPLAY_DEG, angles.inner))),
    [angles.inner],
  );

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
    pinchStartModeRef.current = pinchActiveModeRef.current;
  }, []);

  const handlePinchUpdate = React.useCallback(
    (scale: number) => {
      const startMode = pinchStartModeRef.current;
      let delta = 0;
      if (scale > 1.12) {
        delta = 1;
      } else if (scale < 0.9) {
        delta = -1;
      }

      if (delta === 0) {
        return;
      }

      const currentMode = pinchActiveModeRef.current;
      const startIndex = SENSITIVITY_STATES.indexOf(startMode);
      const nextIndex = clamp(startIndex + delta, 0, SENSITIVITY_STATES.length - 1);
      const nextMode = SENSITIVITY_STATES[nextIndex];

      if (nextMode !== currentMode) {
        pinchActiveModeRef.current = nextMode;
        actions.updateSettings({ sensitivityMode: nextMode });
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

  // Whenever the coarse angle target changes, update the spring's target.
  React.useEffect(() => {
    const current = springRef.current;
    if (Math.abs(current.targetAngle - targetInnerRadians) > EPSILON) {
      springRef.current = { ...current, targetAngle: targetInnerRadians };
      actions.setSpring({ targetAngle: targetInnerRadians });
    }
  }, [actions, targetInnerRadians]);

  // Maintain a requestAnimationFrame loop that advances the critically damped spring.
  React.useEffect(() => {
    let isMounted = true;
    let frame: number;
    let lastTimestamp: number | null = null;

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
  const { locked, indicatorTint: computedIndicatorTint } = usePitchLock({
    cents: pitch.cents,
    midi: pitch.midi,
    baseTint: baseIndicatorTint,
  });

  const noteLabel = React.useMemo(() => {
    if (pitch.midi === null) {
      return "—";
    }

    const enharmonic = midiToEnharmonicNames(pitch.midi);

    const parseNote = (note: string) => {
      const match = note.match(/^([A-G])(#|b)?(\d+)$/);
      if (!match) {
        return { stem: note, octave: "" };
      }

      const [, letter, accidental, octave] = match;
      const accidentalSymbol = accidental === "#" ? "♯" : accidental === "b" ? "♭" : "";

      return {
        stem: `${letter}${accidentalSymbol}`,
        octave,
      };
    };

    const sharp = parseNote(enharmonic.sharp);
    const flat = parseNote(enharmonic.flat);

    if (sharp.stem === flat.stem && sharp.octave === flat.octave) {
      return `${sharp.stem}${sharp.octave}`;
    }

    if (sharp.octave === flat.octave) {
      return `${sharp.stem}/${flat.stem}${flat.octave}`;
    }

    return `${sharp.stem}${sharp.octave}/${flat.stem}${flat.octave}`;
  }, [pitch.midi]);

  const centsLabel = React.useMemo(() => {
    if (!Number.isFinite(pitch.cents)) {
      return "0¢";
    }

    const rounded =
      Math.abs(pitch.cents) < 10 ? pitch.cents.toFixed(1) : Math.round(pitch.cents).toString();
    const prefix = pitch.cents > 0 ? "+" : pitch.cents < 0 ? "−" : "";
    const magnitude = rounded.replace(/^[-+]/, "");
    return `${prefix}${magnitude}¢`;
  }, [pitch.cents]);

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
        <IndexIndicator size={size} tintColor={computedIndicatorTint} locked={locked} />
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.hudContainer}>
          <View style={styles.hudContent}>
            {settings.manualMode ? (
              <View style={styles.manualPill} accessibilityRole="text">
                <Text style={styles.manualPillText}>{`Manual ${manualNoteLabel}`}</Text>
              </View>
            ) : null}
            <Text style={styles.noteLabel} accessibilityRole="text">
              {noteLabel}
            </Text>
            {settings.manualMode ? null : (
              <Text style={styles.centsLabel} accessibilityRole="text">
                {centsLabel}
              </Text>
            )}
          </View>
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
  hudContainer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 24,
  },
  hudContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.6)",
    alignItems: "center",
  },
  manualPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(30, 58, 138, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    marginBottom: 6,
  },
  manualPillText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.25,
  },
  noteLabel: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  centsLabel: {
    marginTop: 4,
    color: "#cbd5f5",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.25,
  },
});

export default TunerFace;
