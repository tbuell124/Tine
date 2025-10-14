import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTuner } from "@state/TunerStateContext";
import { DEG_PER_CENT, MAX_DISPLAY_DEG, midiToEnharmonicNames } from "@utils/music";
import stepSpring from "@utils/spring";
import { InnerWheel } from "./InnerWheel";
import { OuterWheel } from "./OuterWheel";
import { IndexIndicator } from "./IndexIndicator";

const DEFAULT_SIZE = 320;
const INNER_WHEEL_RATIO = 220 / 320; // Mirrors the defaults declared inside the wheel components.
const DETENT_CENTS = 5;
const DETENT_STEP_DEGREES = DETENT_CENTS * DEG_PER_CENT;
const EPSILON = 1e-4;

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;
const radToDeg = (radians: number): number => (radians * 180) / Math.PI;

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
  indicatorTint,
  showDetentPegs = true,
}) => {
  const {
    state: { angles, spring, settings, pitch },
    actions,
  } = useTuner();

  const containerStyle = React.useMemo(
    () => [styles.container, { width: size, height: size }, style],
    [size, style],
  );

  const outerRotation = React.useMemo(() => degToRad(angles.outer), [angles.outer]);
  const targetInnerRadians = React.useMemo(
    () => degToRad(Math.max(-MAX_DISPLAY_DEG, Math.min(MAX_DISPLAY_DEG, angles.inner))),
    [angles.inner],
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

  const locked = React.useMemo(() => {
    if (pitch.midi === null) {
      return false;
    }
    return Math.abs(pitch.cents) <= settings.lockThreshold;
  }, [pitch.cents, pitch.midi, settings.lockThreshold]);

  const innerSize = size * INNER_WHEEL_RATIO;

  return (
    <View style={containerStyle}>
      <OuterWheel size={size} rotation={outerRotation} />
      <View style={[StyleSheet.absoluteFill, styles.centerContent]}>
        <InnerWheel size={innerSize} rotation={innerRotation} showDetentPegs={showDetentPegs} />
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <IndexIndicator size={size} tintColor={indicatorTint} locked={locked} />
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.hudContainer}>
          <View style={styles.hudContent}>
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
