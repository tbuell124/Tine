import { MicPermissionScreen } from '@components/MicPermissionScreen';
import { usePitchDetection } from '@hooks/usePitchDetection';
import { getMonotonicTime } from '@utils/clock';
import { midiToNoteName } from '@utils/music';
import {
  findNoteBoundaryByFrequency,
  frequencyToBoundaryCents,
  type NoteBoundary,
} from '@utils/noteBoundaries';
import React from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const HISTORY_SIZE = 3;
const MAX_DEVIATION = 50;
const MIDI_START = 0;
const MIDI_END = 127;
const CENTER_MIDI = 64;
const STALE_SIGNAL_MS = 900;
const CONFIDENCE_THRESHOLD = 0.6;
const USABLE_CONFIDENCE = 0.7;
const SWELL_HOLD_MS = 520;
const NOTE_HOLD_MS = 1200;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const NOTE_STEMS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const HARMONIC_DIVISORS = [1, 2, 3, 4] as const;

const midiFromFrequency = (frequency: number | null): number | null => {
  if (frequency === null || !Number.isFinite(frequency) || frequency <= 0) return null;
  return 69 + 12 * Math.log2(frequency / 440);
};

const formatNote = (midi: number | null, fallbackName: string | null): string => {
  if (midi !== null && Number.isFinite(midi)) {
    return midiToNoteName(Math.round(midi), 'sharp').replace(/[0-9-]/g, '');
  }

  if (fallbackName) {
    const match = fallbackName.match(/^([A-G])([#b]?)/i);
    if (match) {
      const [, letter, accidental] = match;
      if (accidental === 'b') {
        return midi !== null
          ? midiToNoteName(Math.round(midi), 'sharp').replace(/[0-9-]/g, '')
          : `${letter.toUpperCase()}b`.replace(/-/g, '');
      }
      return `${letter.toUpperCase()}${accidental === '#' ? '#' : ''}`.replace(/-/g, '');
    }
  }

  return '';
};

const resolveBoundaryFromFrequency = (
  frequency: number,
  previous: NoteBoundary | null,
): { boundary: NoteBoundary; cents: number } | null => {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  let bestOverall: { boundary: NoteBoundary; cents: number; score: number } | null = null;
  let bestPrevious: { boundary: NoteBoundary; cents: number; score: number } | null = null;

  for (const divisor of HARMONIC_DIVISORS) {
    const candidateFreq = frequency / divisor;
    if (candidateFreq < 20) {
      continue;
    }
    const boundary = findNoteBoundaryByFrequency(candidateFreq);
    if (!boundary) {
      continue;
    }
    const cents = frequencyToBoundaryCents(candidateFreq, boundary);
    const score = Math.abs(cents) + (divisor - 1) * 4;

    if (!bestOverall || score < bestOverall.score) {
      bestOverall = { boundary, cents, score };
    }

    if (previous && boundary.midi === previous.midi) {
      const prevScore = Math.abs(cents) + (divisor - 1) * 2;
      if (!bestPrevious || prevScore < bestPrevious.score) {
        bestPrevious = { boundary: previous, cents, score: prevScore };
      }
    }
  }

  if (bestPrevious && Math.abs(bestPrevious.cents) <= 55) {
    return { boundary: bestPrevious.boundary, cents: bestPrevious.cents };
  }

  if (!bestOverall) {
    return null;
  }

  return { boundary: bestOverall.boundary, cents: bestOverall.cents };
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
  const [targetBoundary, setTargetBoundary] = React.useState<NoteBoundary | null>(null);
  const [targetCents, setTargetCents] = React.useState(0);
  const lastStableAt = React.useRef<number | null>(null);
  const stableNoteStartRef = React.useRef<number | null>(null);
  const midiHistory = React.useRef<number[]>([]);
  const centsHistory = React.useRef<number[]>([]);
  const listeningPulse = React.useRef(new Animated.Value(1)).current;
  const listeningLoop = React.useRef<Animated.CompositeAnimation | null>(null);
  const outerRotation = React.useRef(new Animated.Value(0)).current;
  const innerCentsRotation = React.useRef(new Animated.Value(0)).current;
  const innerRotationOffsetAnim = React.useRef(new Animated.Value(0)).current;
  const ellipsisPhase = React.useRef(new Animated.Value(0)).current;
  const outerContinuousAngleRef = React.useRef(0);
  const innerRotationOffsetRef = React.useRef(0);
  const swellOpacity = React.useRef(new Animated.Value(0)).current;
  const swellScaleAnim = React.useRef(new Animated.Value(0.92)).current;
  const swellNoteRef = React.useRef<number | null>(null);
  const swellStartRef = React.useRef<number | null>(null);
  const swellRunningRef = React.useRef(false);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(getMonotonicTime());
    }, 250);
    return () => {
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ellipsisPhase, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(ellipsisPhase, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      ellipsisPhase.setValue(0);
    };
  }, [ellipsisPhase]);

  const midiFloat = pitch.frequency ? midiFromFrequency(pitch.frequency) : null;
  const targetMidi = targetBoundary?.midi ?? null;
  const activeCents = targetBoundary !== null ? targetCents : pitch.cents;
  const deviation = clamp(activeCents, -MAX_DEVIATION, MAX_DEVIATION);
  const signalAge = pitch.updatedAt > 0 ? Math.max(0, now - pitch.updatedAt) : Infinity;
  const hasFreshSignal = signalAge <= STALE_SIGNAL_MS;
  const hasConfidence = pitch.confidence >= CONFIDENCE_THRESHOLD;
  const hasPitch = pitch.midi !== null && pitch.noteName !== null;
  const isWeakSignal = !hasFreshSignal || !hasConfidence || !hasPitch;
  const showSignalCandidate = hasFreshSignal && pitch.confidence >= USABLE_CONFIDENCE && hasPitch;
  if (!showSignalCandidate) {
    stableNoteStartRef.current = null;
  } else {
    stableNoteStartRef.current ??= now;
  }
  const showSignal =
    showSignalCandidate &&
    stableNoteStartRef.current !== null &&
    now - stableNoteStartRef.current >= NOTE_HOLD_MS;
  const deviationDisplay = smoothedMidi !== null ? smoothedCents : deviation;
  const signalStrength = clamp((pitch.confidence - 0.06) / 0.7, 0, 1);
  const swellScale = 1;
  const allowMotion = signalStrength > 0.18;
  const incomingMidi = targetMidi ?? midiFloat ?? pitch.midi ?? derivedMidi ?? null;
  const roundedIncomingMidi =
    incomingMidi !== null && Number.isFinite(incomingMidi) ? Math.round(incomingMidi) : null;

  React.useEffect(() => {
    setDerivedMidi(midiFromFrequency(pitch.frequency ?? null));
  }, [pitch.frequency]);

  React.useEffect(() => {
    if (!pitch.frequency || !Number.isFinite(pitch.frequency) || pitch.frequency <= 0) {
      return;
    }

    if (!hasFreshSignal) {
      return;
    }

    if (!showSignalCandidate) {
      return;
    }

    const resolved = resolveBoundaryFromFrequency(pitch.frequency, targetBoundary);
    if (!resolved) {
      return;
    }

    const clampedCents = clamp(resolved.cents, -MAX_DEVIATION, MAX_DEVIATION);

    if (!targetBoundary || resolved.boundary.midi !== targetBoundary.midi) {
      if (!targetBoundary) {
        innerRotationOffsetRef.current = 0;
        innerRotationOffsetAnim.setValue(0);
      } else {
        innerRotationOffsetRef.current += (resolved.boundary.midi - targetBoundary.midi) * 360;
        innerRotationOffsetAnim.setValue(innerRotationOffsetRef.current);
      }
      setTargetBoundary(resolved.boundary);
    }
    setTargetCents(clampedCents);
  }, [hasFreshSignal, pitch.frequency, showSignalCandidate, targetBoundary]);

  React.useEffect(() => {
    const nowTime = getMonotonicTime();
    const isInTuneWindow = Math.abs(deviationDisplay) <= 3;
    const hasStableSignal =
      roundedIncomingMidi !== null &&
      signalStrength >= USABLE_CONFIDENCE &&
      allowMotion &&
      isInTuneWindow;

    if (!hasStableSignal) {
      swellNoteRef.current = null;
      swellStartRef.current = null;
      if (!swellRunningRef.current) {
        swellOpacity.setValue(0);
        swellScaleAnim.setValue(0.92);
      }
      return;
    }

    if (swellNoteRef.current !== roundedIncomingMidi) {
      swellNoteRef.current = roundedIncomingMidi;
      swellStartRef.current = nowTime;
      return;
    }

    if (
      !swellRunningRef.current &&
      swellStartRef.current !== null &&
      nowTime - swellStartRef.current >= SWELL_HOLD_MS
    ) {
      swellRunningRef.current = true;
      swellOpacity.setValue(0);
      swellScaleAnim.setValue(0.92);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(swellOpacity, {
            toValue: 0.85,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(swellScaleAnim, {
            toValue: 1.02,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(swellOpacity, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(swellScaleAnim, {
            toValue: 0.95,
            duration: 320,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        swellRunningRef.current = false;
        swellStartRef.current = getMonotonicTime();
      });
    }
  }, [
    allowMotion,
    deviationDisplay,
    roundedIncomingMidi,
    signalStrength,
    swellOpacity,
    swellScaleAnim,
  ]);

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
        setTargetBoundary(null);
        setTargetCents(0);
        innerRotationOffsetRef.current = 0;
        innerRotationOffsetAnim.setValue(0);
      }
      return;
    }

    const clampedMidi = clamp(incomingMidi, MIDI_START, MIDI_END);
    const clampedCents = clamp(activeCents, -MAX_DEVIATION, MAX_DEVIATION);

    midiHistory.current = [...midiHistory.current.slice(-(HISTORY_SIZE - 1)), clampedMidi];
    centsHistory.current = [...centsHistory.current.slice(-(HISTORY_SIZE - 1)), clampedCents];

    const medianMidi = median(midiHistory.current);
    const medianCents = median(centsHistory.current);

    const alphaMidi = 0.3;
    const alphaCents = 0.4;
    const maxCentsStep = 14;

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
    if (!showSignal) {
      return;
    }
    if (targetMidi !== null && Number.isFinite(targetMidi)) {
      setDisplayMidi(Math.round(targetMidi));
      return;
    }
    const nextMidi = smoothedMidi ?? incomingMidi;
    if (nextMidi === null || !Number.isFinite(nextMidi)) {
      setDisplayMidi(null);
      return;
    }
    setDisplayMidi(Math.round(nextMidi));
  }, [incomingMidi, showSignal, smoothedMidi, targetMidi]);

  const noteLabel = React.useMemo(
    () => formatNote(displayMidi ?? smoothedMidi ?? incomingMidi ?? pitch.midi, pitch.noteName),
    [displayMidi, incomingMidi, pitch.midi, pitch.noteName, smoothedMidi],
  );
  const ellipsisOpacity = React.useCallback(
    (start: number) =>
      ellipsisPhase.interpolate({
        inputRange: [0, start, start + 0.2, start + 0.4, 1],
        outputRange: [0.2, 0.2, 1, 0.2, 0.2],
        extrapolate: 'clamp',
      }),
    [ellipsisPhase],
  );

  const ringSize = React.useMemo(
    () => (Platform.OS === 'web' ? 340 : Math.min(Math.max(width - 80, 320), 520)),
    [width],
  );
  const ringRadius = ringSize / 2 - 30;
  const innerRingRadius = ringSize * 0.26;
  const topTickHeight = 16;
  const noteIndex = React.useMemo(() => {
    const active = targetMidi ?? displayMidi ?? CENTER_MIDI;
    return ((active % 12) + 12) % 12;
  }, [displayMidi, targetMidi]);
  const centsAngle =
    (clamp(deviationDisplay, -MAX_DEVIATION, MAX_DEVIATION) / 50) * 180 +
    innerRotationOffsetRef.current;
  const outerTargetAngleRaw = -noteIndex * 30;
  const outerCentsRotation = React.useMemo(
    () => Animated.divide(Animated.subtract(innerRotationOffsetAnim, innerCentsRotation), 12),
    [innerCentsRotation, innerRotationOffsetAnim],
  );
  const totalOuterRotation = React.useMemo(
    () => Animated.add(outerRotation, outerCentsRotation),
    [outerCentsRotation, outerRotation],
  );
  const ringRotationDeg = React.useMemo(
    () =>
      totalOuterRotation.interpolate({
        inputRange: [-1080, 1080],
        outputRange: ['-1080deg', '1080deg'],
      }),
    [totalOuterRotation],
  );
  const innerRingRotationDeg = React.useMemo(
    () =>
      Animated.add(Animated.multiply(outerRotation, -12), innerCentsRotation).interpolate({
        inputRange: [-7200, 7200],
        outputRange: ['-7200deg', '7200deg'],
      }),
    [innerCentsRotation, outerRotation],
  );
  const tickHeight = 24;
  const tickOffset = ringRadius - tickHeight / 2;
  const ringRotationInv = React.useMemo(
    () => Animated.multiply(totalOuterRotation, -1),
    [totalOuterRotation],
  );
  const ringRotationInvDeg = React.useMemo(
    () =>
      ringRotationInv.interpolate({
        inputRange: [-1080, 1080],
        outputRange: ['-1080deg', '1080deg'],
      }),
    [ringRotationInv],
  );
  React.useEffect(() => {
    if (!showSignal) {
      return;
    }
    const computeContinuousTarget = () => {
      if (!allowMotion) {
        return 0;
      }
      const prev = outerContinuousAngleRef.current;
      let candidate = outerTargetAngleRaw;
      while (candidate - prev > 180) {
        candidate -= 360;
      }
      while (candidate - prev < -180) {
        candidate += 360;
      }
      outerContinuousAngleRef.current = candidate;
      return candidate;
    };

    const target = computeContinuousTarget();
    Animated.timing(outerRotation, {
      toValue: target,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [allowMotion, outerRotation, outerTargetAngleRaw, showSignal]);

  React.useEffect(() => {
    if (!showSignal) {
      return;
    }
    const target = allowMotion ? centsAngle : 0;
    Animated.timing(innerCentsRotation, {
      toValue: target,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [allowMotion, centsAngle, innerCentsRotation, showSignal]);

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
          <View
            style={[
              styles.topTick,
              {
                top: ringSize / 2 - ringRadius - topTickHeight + 2,
                height: topTickHeight,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                transform: [{ scale: swellScale }, { rotate: ringRotationDeg }],
              },
            ]}
          >
            {NOTE_STEMS.map((stem, idx) => {
              const angle = idx * 30;
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
                width: ringSize * 0.52,
                height: ringSize * 0.52,
                borderRadius: (ringSize * 0.52) / 2,
                transform: [{ scale: swellScale }, { rotate: innerRingRotationDeg }],
              },
            ]}
          >
            {showSignal ? (
              <View
                style={[
                  styles.innerTickWrap,
                  {
                    transform: [{ rotate: '0deg' }, { translateY: -innerRingRadius }],
                  },
                ]}
              >
                <View style={[styles.innerTick, { height: 28, width: 5 }]} />
              </View>
            ) : null}
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.swellOverlay,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                opacity: swellOpacity,
                transform: [{ scale: swellScaleAnim }],
              },
            ]}
          />
          <View style={styles.centerOverlay}>
            {showSignal ? (
              <Text style={[styles.centerNote, { color: '#e2e8f0' }]} testID="center-note">
                {noteLabel}
              </Text>
            ) : (
              <View style={styles.ellipsisRow} testID="center-note">
                <Animated.Text
                  style={[styles.centerNote, { color: '#e2e8f0', opacity: ellipsisOpacity(0) }]}
                >
                  .
                </Animated.Text>
                <Animated.Text
                  style={[styles.centerNote, { color: '#e2e8f0', opacity: ellipsisOpacity(0.2) }]}
                >
                  .
                </Animated.Text>
                <Animated.Text
                  style={[styles.centerNote, { color: '#e2e8f0', opacity: ellipsisOpacity(0.4) }]}
                >
                  .
                </Animated.Text>
              </View>
            )}
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
    backgroundColor: '#0b1a14',
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
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    overflow: 'visible',
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  topTick: {
    position: 'absolute',
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: '#e2e8f0',
    pointerEvents: 'none',
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.75,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  innerRing: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.7)',
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  swellOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(226, 232, 240, 0.18)',
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
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  noteText: {
    fontSize: 17,
    letterSpacing: 1.2,
    fontFamily: 'LatoBlack',
    textShadowColor: 'rgba(226, 232, 240, 0.7)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
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
    letterSpacing: 4,
    color: '#e2e8f0',
    fontFamily: 'LatoBlack',
    textShadowColor: 'rgba(226, 232, 240, 0.85)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  ellipsisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  lockLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'LatoBold',
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
    color: '#e2e8f0',
    fontFamily: 'LatoBlack',
  },
  unavailableMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#cbd5e1',
    fontFamily: 'LatoRegular',
  },
});
