import { MicPermissionScreen } from '@components/MicPermissionScreen';
import { usePitchDetection } from '@hooks/usePitchDetection';
import { getMonotonicTime } from '@utils/clock';
import { midiToNoteName } from '@utils/music';
import React from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const HISTORY_SIZE = 7;
const MAX_DEVIATION = 50;
const MIDI_START = 0;
const MIDI_END = 127;
const CENTER_MIDI = 64;
const STALE_SIGNAL_MS = 900;
const CONFIDENCE_THRESHOLD = 0.14;
const USABLE_CONFIDENCE = 0.2;
const NOTE_DWELL_MS = 500;
const IN_TUNE_BOUNDARY_CENTS = 3;
const IN_TUNE_BOUNDARY_DEG = (IN_TUNE_BOUNDARY_CENTS / 100) * 30;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

type RGB = { r: number; g: number; b: number };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const hex = (value: number): string => value.toString(16).padStart(2, '0');
const mix = (from: RGB, to: RGB, t: number): string => {
  const r = Math.round(lerp(from.r, to.r, t));
  const g = Math.round(lerp(from.g, to.g, t));
  const b = Math.round(lerp(from.b, to.b, t));
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};
const hexToRgb = (value: string): RGB | null => {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const intVal = parseInt(match[1], 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
};
const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const COLOR_NEUTRAL: RGB = { r: 16, g: 122, b: 71 }; // darker green
const COLOR_YELLOW: RGB = { r: 174, g: 133, b: 18 }; // darker yellow
const COLOR_FAR: RGB = { r: 148, g: 36, b: 36 }; // darker red
const NOTE_STEMS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const colorForDeviation = (cents: number): string => {
  const distance = clamp(Math.abs(cents) / MAX_DEVIATION, 0, 1);
  if (distance <= 0.5) {
    return mix(COLOR_NEUTRAL, COLOR_YELLOW, distance / 0.5);
  }
  return mix(COLOR_YELLOW, COLOR_FAR, (distance - 0.5) / 0.5);
};

const midiFromFrequency = (frequency: number | null): number | null => {
  if (frequency === null || !Number.isFinite(frequency) || frequency <= 0) return null;
  return 69 + 12 * Math.log2(frequency / 440);
};

const formatNote = (midi: number | null, fallbackName: string | null): string => {
  if (midi !== null && Number.isFinite(midi)) {
    return midiToNoteName(Math.round(midi), 'sharp').replace(/[0-9-–—]/g, '');
  }

  if (fallbackName) {
    const match = fallbackName.match(/^([A-G])([#b]?)/i);
    if (match) {
      const [, letter, accidental] = match;
      if (accidental === 'b') {
        return midi !== null
          ? midiToNoteName(Math.round(midi), 'sharp').replace(/[0-9-–—]/g, '')
          : `${letter.toUpperCase()}b`.replace(/[-–—]/g, '');
      }
      return `${letter.toUpperCase()}${accidental === '#' ? '#' : ''}`.replace(/[-–—]/g, '');
    }
  }

  return '';
};

export const TunerScreen: React.FC = () => {
  const { available, permission, requestPermission, openSettings, pitch, listening } =
    usePitchDetection();
  const { width } = useWindowDimensions();
  const [now, setNow] = React.useState(getMonotonicTime());
  const [smoothedMidi, setSmoothedMidi] = React.useState<number | null>(null);
  const [smoothedCents, setSmoothedCents] = React.useState(0);
  const [displayMidi, setDisplayMidi] = React.useState<number | null>(null);
  const [derivedMidi, setDerivedMidi] = React.useState<number | null>(null);
  const lastStableAt = React.useRef<number | null>(null);
  const candidateMidi = React.useRef<number | null>(null);
  const candidateStart = React.useRef<number | null>(null);
  const midiHistory = React.useRef<number[]>([]);
  const centsHistory = React.useRef<number[]>([]);
  const listeningPulse = React.useRef(new Animated.Value(1)).current;
  const listeningLoop = React.useRef<Animated.CompositeAnimation | null>(null);
  const ringRotation = React.useRef(new Animated.Value(0)).current;
  const ringContinuousAngleRef = React.useRef(0);
  const [smoothColor, setSmoothColor] = React.useState(COLOR_NEUTRAL);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(getMonotonicTime());
    }, 250);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const deviation = clamp(pitch.cents, -MAX_DEVIATION, MAX_DEVIATION);
  const signalAge = pitch.updatedAt > 0 ? Math.max(0, now - pitch.updatedAt) : Infinity;
  const hasFreshSignal = signalAge <= STALE_SIGNAL_MS;
  const hasConfidence = pitch.confidence >= CONFIDENCE_THRESHOLD;
  const hasPitch = pitch.midi !== null && pitch.noteName !== null;
  const isWeakSignal = !hasFreshSignal || !hasConfidence || !hasPitch;
  const deviationDisplay = smoothedMidi !== null ? smoothedCents : deviation;
  const indicatorColor = colorForDeviation(deviationDisplay);
  const signalStrength = clamp((pitch.confidence - 0.08) / 0.7, 0, 1);
  const displayOpacity = signalStrength <= 0.05 ? 0.08 : 0.25 + signalStrength * 0.75;
  const swellScale = signalStrength >= 0.9 && Math.abs(deviationDisplay) <= 3 ? 1.12 : 1;
  const allowMotion = signalStrength > 0.18;
  const incomingMidi =
    pitch.midi ?? derivedMidi ?? (pitch.frequency ? midiFromFrequency(pitch.frequency) : null);

  React.useEffect(() => {
    setDerivedMidi(midiFromFrequency(pitch.frequency ?? null));
  }, [pitch.frequency]);

  React.useEffect(() => {
    if (isWeakSignal || incomingMidi === null || pitch.confidence < USABLE_CONFIDENCE) {
      // Drift back to center when signal is weak; drop after extended staleness.
      const centerMidi = CENTER_MIDI;
      setSmoothedMidi((prev) => (prev === null ? null : prev + (centerMidi - prev) * 0.08));
      setSmoothedCents((prev) => prev * 0.85);
      if (lastStableAt.current && now - lastStableAt.current > STALE_SIGNAL_MS * 1.4) {
        midiHistory.current = [];
        centsHistory.current = [];
        setSmoothedMidi(null);
        setSmoothedCents(0);
        setDisplayMidi(null);
      }
      return;
    }

    const clampedMidi = clamp(incomingMidi, MIDI_START, MIDI_END);
    const clampedCents = clamp(pitch.cents, -MAX_DEVIATION, MAX_DEVIATION);

    midiHistory.current = [...midiHistory.current.slice(-(HISTORY_SIZE - 1)), clampedMidi];
    centsHistory.current = [...centsHistory.current.slice(-(HISTORY_SIZE - 1)), clampedCents];

    const medianMidi = median(midiHistory.current);
    const medianCents = median(centsHistory.current);

    const alphaMidi = 0.12;
    const alphaCents = 0.2;
    const maxCentsStep = 6;

    setSmoothedMidi((prev) =>
      prev === null ? medianMidi : prev + (medianMidi - prev) * alphaMidi,
    );

    setSmoothedCents((prev) => {
      const delta = clamp(medianCents - prev, -maxCentsStep, maxCentsStep);
      return prev + delta * alphaCents;
    });

    lastStableAt.current = now;
  }, [incomingMidi, isWeakSignal, now, pitch.cents, pitch.confidence]);

  React.useEffect(() => {
    const targetMidi = smoothedMidi ?? incomingMidi;
    if (targetMidi === null) {
      return;
    }
    const rounded = Math.round(targetMidi);

    if (displayMidi === null) {
      setDisplayMidi(rounded);
      candidateMidi.current = null;
      candidateStart.current = null;
      return;
    }

    if (rounded === displayMidi) {
      candidateMidi.current = null;
      candidateStart.current = null;
      return;
    }

    if (candidateMidi.current !== rounded) {
      candidateMidi.current = rounded;
      candidateStart.current = now;
      return;
    }

    if (candidateStart.current !== null && now - candidateStart.current >= NOTE_DWELL_MS) {
      setDisplayMidi(rounded);
      candidateMidi.current = null;
      candidateStart.current = null;
    }
  }, [displayMidi, incomingMidi, now, smoothedMidi]);

  const noteLabel = React.useMemo(
    () => formatNote(displayMidi ?? smoothedMidi ?? incomingMidi ?? pitch.midi, pitch.noteName),
    [displayMidi, incomingMidi, pitch.midi, pitch.noteName, smoothedMidi],
  );

  const ringSize = React.useMemo(() => Math.min(Math.max(width - 80, 320), 520), [width]);
  const ringRadius = ringSize / 2 - 30;
  const innerRingRadius = ringSize * 0.3;
  const boundaryStartRadius = Math.min(ringRadius - 8, innerRingRadius + 24);
  const boundaryLineLength = Math.max(ringRadius - boundaryStartRadius, 0);
  const boundaryLineOffset = (boundaryStartRadius + ringRadius) / 2;
  const noteIndex = React.useMemo(() => {
    const active = displayMidi ?? smoothedMidi ?? incomingMidi ?? CENTER_MIDI;
    const idx = ((Math.round(active) % 12) + 12) % 12;
    return idx;
  }, [displayMidi, incomingMidi, smoothedMidi]);
  const centsAngle = (clamp(deviationDisplay, -MAX_DEVIATION, MAX_DEVIATION) / 100) * 30;
  const ringTargetAngleRaw = noteIndex * 30 + centsAngle;
  const ringRotationDeg = React.useMemo(
    () =>
      ringRotation.interpolate({
        inputRange: [-1080, 1080],
        outputRange: ['-1080deg', '1080deg'],
      }),
    [ringRotation],
  );
  const innerRingRotationDeg = React.useMemo(() => {
    const innerRotation = Animated.multiply(ringRotation, 12);
    return innerRotation.interpolate({
      inputRange: [-12960, 12960],
      outputRange: ['-12960deg', '12960deg'],
    });
  }, [ringRotation]);
  const tickHeight = 24;
  const tickOffset = ringRadius - tickHeight / 2;
  const ringRotationInvDeg = React.useMemo(() => {
    const invRotation = Animated.multiply(ringRotation, -1);
    return invRotation.interpolate({
      inputRange: [-1080, 1080],
      outputRange: ['-1080deg', '1080deg'],
    });
  }, [ringRotation]);
  const boundaryAngles = React.useMemo(
    () => [-IN_TUNE_BOUNDARY_DEG, IN_TUNE_BOUNDARY_DEG],
    [],
  );
  React.useEffect(() => {
    const computeContinuousTarget = () => {
      if (!allowMotion) {
        return 0;
      }
      const prev = ringContinuousAngleRef.current;
      let candidate = ringTargetAngleRaw;
      while (candidate - prev > 180) {
        candidate -= 360;
      }
      while (candidate - prev < -180) {
        candidate += 360;
      }
      // Smooth the transition to reduce abrupt jumps.
      const blended = prev + (candidate - prev) * 0.2;
      // Clamp per-frame change to avoid sudden swings on noisy frames.
      const maxStep = 25;
      const delta = Math.max(Math.min(blended - prev, maxStep), -maxStep);
      const next = prev + delta;
      ringContinuousAngleRef.current = next;
      return next;
    };

    const target = computeContinuousTarget();
    Animated.spring(ringRotation, {
      toValue: target,
      useNativeDriver: true,
      friction: 7,
      tension: 50,
    }).start();
  }, [allowMotion, ringRotation, ringTargetAngleRaw]);

  React.useEffect(() => {
    const targetRgb = hexToRgb(indicatorColor);
    if (!targetRgb) {
      return;
    }
    setSmoothColor((prevRgb) => ({
      r: Math.round(prevRgb.r + (targetRgb.r - prevRgb.r) * 0.18),
      g: Math.round(prevRgb.g + (targetRgb.g - prevRgb.g) * 0.18),
      b: Math.round(prevRgb.b + (targetRgb.b - prevRgb.b) * 0.18),
    }));
  }, [indicatorColor]);

  React.useEffect(() => {
    if (listening && permission === 'granted') {
      if (listeningLoop.current) {
        listeningLoop.current.stop();
        listeningLoop.current = null;
      }

      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(listeningPulse, {
            toValue: 1.08,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(listeningPulse, {
            toValue: 0.94,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

      listeningLoop.current = loop;
      loop.start();
      return () => {
        loop.stop();
      };
    }

    if (listeningLoop.current) {
      listeningLoop.current.stop();
      listeningLoop.current = null;
    }
    listeningPulse.setValue(1);
  }, [listening, listeningPulse, permission]);

  let body: React.ReactNode = null;

  if (!available) {
    body = (
      <View style={styles.unavailableContainer}>
        <Text style={styles.unavailableTitle}>Pitch detector unavailable</Text>
        <Text style={styles.unavailableMessage}>
          Build or install the custom dev client to load the native pitch detector. Expo Go lacks
          the audio bridge needed for live tuning.
        </Text>
      </View>
    );
  } else if (permission === 'unknown') {
    body = (
      <MicPermissionScreen
        mode="request"
        onRequestPermission={() => {
          requestPermission().catch(() => {});
        }}
      />
    );
  } else if (permission === 'denied') {
    body = (
      <MicPermissionScreen
        mode="denied"
        onOpenSettings={openSettings}
        onRequestPermission={() => {
          requestPermission().catch(() => {});
        }}
      />
    );
  } else {
    body = (
      <View style={styles.screen}>
        <View style={[styles.ringWrapper, { width: ringSize, height: ringSize }]}>
          {boundaryAngles.map((angle) => (
            <View
              key={`boundary-line-${angle}`}
              style={[
                styles.boundaryLineContainer,
                { transform: [{ rotate: `${angle}deg` }] },
              ]}
            >
              <View
                style={[
                  styles.boundaryLine,
                  {
                    height: boundaryLineLength,
                    transform: [{ translateY: -boundaryLineOffset }],
                  },
                ]}
              />
            </View>
          ))}
          <Animated.View
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                backgroundColor: `rgba(${smoothColor.r}, ${smoothColor.g}, ${smoothColor.b}, ${displayOpacity})`,
                transform: [{ scale: swellScale }, { rotate: ringRotationDeg }],
              },
            ]}
          >
            {NOTE_STEMS.map((stem, idx) => {
              const angle = -idx * 30;
              return (
                <View
                  key={stem}
                  style={[
                    styles.notePillWrap,
                    {
                      transform: [{ rotate: `${angle}deg` }, { translateY: -tickOffset }],
                    },
                  ]}
                >
                  <View style={[styles.tick, { backgroundColor: '#cbd5e1' }]} />
                  <Text
                    style={[
                      styles.noteText,
                      {
                        color: '#cbd5e1',
                        transform: [
                          { rotate: ringRotationInvDeg },
                          { rotate: `${-angle}deg` },
                          { translateY: 10 },
                        ],
                      },
                    ]}
                  >
                    {stem}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
          <Animated.View
            style={[
              styles.innerRing,
              {
                width: ringSize * 0.6,
                height: ringSize * 0.6,
                borderRadius: (ringSize * 0.6) / 2,
                backgroundColor: `rgba(${smoothColor.r}, ${smoothColor.g}, ${smoothColor.b}, ${displayOpacity})`,
                transform: [{ scale: swellScale }, { rotate: innerRingRotationDeg }],
              },
            ]}
          >
            <View
              style={[
                styles.innerTickWrap,
                {
                  transform: [{ rotate: '0deg' }, { translateY: -(ringSize * 0.3) }],
                },
              ]}
            >
              <View style={[styles.innerTick, { height: 28, width: 5 }]} />
            </View>
            {[-IN_TUNE_BOUNDARY_DEG, IN_TUNE_BOUNDARY_DEG].map((angle) => (
              <View
                key={`boundary-${angle}`}
                style={[
                  styles.innerTickWrap,
                  {
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateY: -(ringSize * 0.3) },
                    ],
                  },
                ]}
              >
                <View style={styles.boundaryTick} />
              </View>
            ))}
          </Animated.View>
          <View style={styles.centerOverlay}>
            <Text style={[styles.centerNote, { color: '#e2e8f0' }]}>{noteLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  return <>{body}</>;
};

export default TunerScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050814',
    gap: 28,
    paddingHorizontal: 16,
    paddingVertical: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  headerRow: {
    width: '100%',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  ringWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    alignSelf: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: '#111827',
    overflow: 'visible',
  },
  boundaryLineContainer: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  boundaryLine: {
    width: 2,
    backgroundColor: '#ffffff',
    borderRadius: 1,
    marginLeft: -1,
  },
  innerRing: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notePillWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 2,
    height: 24,
    borderRadius: 2,
    marginBottom: 10,
  },
  noteText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: 'Lato',
  },
  ringPointer: {
    display: 'none',
  },
  pointerLine: {
    display: 'none',
  },
  pointerNote: {
    display: 'none',
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    pointerEvents: 'none',
  },
  centerNote: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#e2e8f0',
    fontFamily: 'Lato',
  },
  innerTickWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerTick: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
  },
  boundaryTick: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  lockLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: 'Lato',
  },
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#020617',
  },
  unavailableTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e2e8f0',
    fontFamily: 'Lato',
  },
  unavailableMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#cbd5e1',
    fontFamily: 'Lato',
  },
});
