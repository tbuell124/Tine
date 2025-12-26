import { AdBanner } from '@components/AdBanner';
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
  Image,
  Platform,
  Pressable,
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
const AUDIO_ACTIVE_DB = -80;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const medianBuffer = (buffer: Float32Array, count: number): number => {
  if (count <= 0) return 0;
  const values = Array.from(buffer.slice(0, count));
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
};

const NOTE_STEMS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const HARMONIC_DIVISORS = [1, 2, 3, 4] as const;
const MINOR_TICK_COUNT = 120;
const MINOR_TICK_SPACING = 360 / MINOR_TICK_COUNT;
const MINOR_TICKS = Array.from({ length: MINOR_TICK_COUNT }, (_, i) => i * MINOR_TICK_SPACING);
const DOT_RING_COUNT = 12;
const DOT_RING_RADIUS = 18;

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

const dialHueForAngle = (angle: number): number => {
  const radians = (-angle * Math.PI) / 180;
  const verticalBlend = (1 - Math.cos(radians)) / 2;
  return 120 - 120 * verticalBlend;
};

const dialColorForAngle = (angle: number, isMajor: boolean): string => {
  const hue = dialHueForAngle(angle);
  return `hsl(${hue.toFixed(1)}, 90%, ${isMajor ? 62 : 48}%)`;
};

const snapToMinorTick = (angle: number): number => {
  return Math.round(angle / MINOR_TICK_SPACING) * MINOR_TICK_SPACING;
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
    const score = Math.abs(cents) + (divisor - 1) * 12;

    if (!bestOverall || score < bestOverall.score) {
      bestOverall = { boundary, cents, score };
    }

    if (previous && boundary.midi === previous.midi) {
      const prevScore = Math.abs(cents) + (divisor - 1) * 10;
      if (!bestPrevious || prevScore < bestPrevious.score) {
        bestPrevious = { boundary: previous, cents, score: prevScore };
      }
    }
  }

  if (bestPrevious && Math.abs(bestPrevious.cents) <= 35) {
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
  const isWeb = Platform.OS === 'web';
  const { width, height } = useWindowDimensions();
  const BASE_FRAME_WIDTH = 360;
  const BASE_FRAME_HEIGHT = 640;
  const BASE_RING_SCALE = 0.94;
  const [now, setNow] = React.useState(getMonotonicTime());
  const [smoothedMidi, setSmoothedMidi] = React.useState<number | null>(null);
  const [, setSmoothedCents] = React.useState(0);
  const [displayMidi, setDisplayMidi] = React.useState<number | null>(null);
  const [derivedMidi, setDerivedMidi] = React.useState<number | null>(null);
  const [targetBoundary, setTargetBoundary] = React.useState<NoteBoundary | null>(null);
  const [targetCents, setTargetCents] = React.useState(0);
  const [showDebug, setShowDebug] = React.useState(false);
  const lastStableAt = React.useRef<number | null>(null);
  const midiHistory = React.useRef(new Float32Array(HISTORY_SIZE));
  const centsHistory = React.useRef(new Float32Array(HISTORY_SIZE));
  const historyCountRef = React.useRef(0);
  const listeningPulse = React.useRef(new Animated.Value(1)).current;
  const listeningLoop = React.useRef<Animated.CompositeAnimation | null>(null);
  const outerRotation = React.useRef(new Animated.Value(0)).current;
  const innerCentsRotation = React.useRef(new Animated.Value(0)).current;
  const [outerAngle, setOuterAngle] = React.useState(0);
  const ellipsisPhase = React.useRef(new Animated.Value(0)).current;
  const outerContinuousAngleRef = React.useRef(0);
  const innerContinuousAngleRef = React.useRef(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(getMonotonicTime());
    }, 250);
    return () => {
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    const useNativeDriver = !isWeb;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ellipsisPhase, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver,
        }),
        Animated.timing(ellipsisPhase, {
          toValue: 0,
          duration: 0,
          useNativeDriver,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      ellipsisPhase.setValue(0);
    };
  }, [ellipsisPhase]);

  React.useEffect(() => {
    if (!isWeb) {
      return undefined;
    }
    const id = outerRotation.addListener(({ value }) => {
      setOuterAngle(value);
    });
    return () => {
      outerRotation.removeListener(id);
    };
  }, [isWeb, outerRotation]);

  const midiFloat = pitch.frequency ? midiFromFrequency(pitch.frequency) : null;
  const targetMidi = targetBoundary?.midi ?? null;
  const activeCents = targetBoundary !== null ? targetCents : pitch.cents;
  const signalAge = pitch.updatedAt > 0 ? Math.max(0, now - pitch.updatedAt) : Infinity;
  const hasFreshSignal = signalAge <= STALE_SIGNAL_MS;
  const audioActive = pitch.levelDb !== null && Number.isFinite(pitch.levelDb) && pitch.levelDb > AUDIO_ACTIVE_DB;
  const hasConfidence = pitch.confidence > 0;
  const hasPitch = pitch.midi !== null && pitch.noteName !== null;
  const isWeakSignal = !hasFreshSignal || !hasConfidence || !hasPitch;
  const showSignalCandidate =
    hasFreshSignal && hasPitch && (pitch.confidence > 0 || audioActive);
  const showDots = pitch.confidence <= 0;
  const showTick = !showDots && hasPitch;
  const showNote = showTick;
  const tickCents = clamp(activeCents, -MAX_DEVIATION, MAX_DEVIATION);
  const inTune = Math.abs(tickCents) <= 2;
  const swellScale = 1;
  const allowMotion = showTick;
  const incomingMidi = targetMidi ?? midiFloat ?? pitch.midi ?? derivedMidi ?? null;

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
      setTargetBoundary(resolved.boundary);
    }
    setTargetCents(clampedCents);
  }, [hasFreshSignal, pitch.frequency, showSignalCandidate, targetBoundary]);

  React.useEffect(() => {
    if (isWeakSignal || incomingMidi === null) {
      // Drift back to center when signal is weak; drop after extended staleness.
      const centerMidi = CENTER_MIDI;
      setSmoothedMidi((prev) => (prev === null ? null : prev + (centerMidi - prev) * 0.08));
      setSmoothedCents((prev) => prev * 0.85);
      if (lastStableAt.current && now - lastStableAt.current > STALE_SIGNAL_MS * 1.4) {
        historyCountRef.current = 0;
        midiHistory.current.fill(0);
        centsHistory.current.fill(0);
        setSmoothedMidi(null);
        setSmoothedCents(0);
        setDisplayMidi(null);
        setTargetBoundary(null);
        setTargetCents(0);
      }
      return;
    }

    const clampedMidi = clamp(incomingMidi, MIDI_START, MIDI_END);
    const clampedCents = clamp(activeCents, -MAX_DEVIATION, MAX_DEVIATION);

    const index = historyCountRef.current % HISTORY_SIZE;
    midiHistory.current[index] = clampedMidi;
    centsHistory.current[index] = clampedCents;
    historyCountRef.current = Math.min(historyCountRef.current + 1, HISTORY_SIZE);

    const medianMidi = medianBuffer(midiHistory.current, historyCountRef.current);
    const medianCents = medianBuffer(centsHistory.current, historyCountRef.current);

    const alphaMidi = 0.3;
    const alphaCents = 0.25;
    const maxCentsStep = 8;

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
    if (!showTick) {
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
  }, [incomingMidi, showTick, smoothedMidi, targetMidi]);

  const noteLabel = React.useMemo(
    () => formatNote(displayMidi ?? smoothedMidi ?? incomingMidi ?? pitch.midi, pitch.noteName),
    [displayMidi, incomingMidi, pitch.midi, pitch.noteName, smoothedMidi],
  );
  const webFrameSize = React.useMemo(() => {
    if (!isWeb) {
      return { width: BASE_FRAME_WIDTH, height: BASE_FRAME_HEIGHT };
    }
    const paddedWidth = Math.max(width - 16, 260);
    const paddedHeight = Math.max(height - 24, 360);
    const frameWidth = Math.min(paddedWidth, (paddedHeight * 9) / 16);
    const frameHeight = (frameWidth * 16) / 9;
    return {
      width: Number.isFinite(frameWidth) ? frameWidth : BASE_FRAME_WIDTH,
      height: Number.isFinite(frameHeight) ? frameHeight : BASE_FRAME_HEIGHT,
    };
  }, [height, isWeb, width]);
  const webScale = React.useMemo(() => {
    if (!isWeb) {
      return 1;
    }
    const nextScale = webFrameSize.width / BASE_FRAME_WIDTH;
    return Number.isFinite(nextScale) ? nextScale : 1;
  }, [isWeb, webFrameSize.width]);
  const ringSize = React.useMemo(() => {
    if (isWeb) {
      return BASE_FRAME_WIDTH * BASE_RING_SCALE;
    }
    return Math.min(Math.max(width - 24, 360), 580);
  }, [isWeb, width]);
  const ringRadius = ringSize / 2 - 18;
  const innerRingScale = isWeb ? 0.46 : 0.52;
  const innerRingSize = ringSize * innerRingScale;
  const innerRingRadius = innerRingSize / 2;
  const topTickHeight = 72;
  const fineTickHeight = topTickHeight;
  const topTickOffset = 20;
  const noteRadius = ringRadius - 8;
  const minorTickRadius = ringRadius - 54;
  const ringMidi = midiFloat ?? derivedMidi ?? targetMidi ?? CENTER_MIDI;
  const ringMidiNormalized = React.useMemo(
    () => (((ringMidi ?? CENTER_MIDI) % 12) + 12) % 12,
    [ringMidi],
  );
  const logicalTickAngle = 180 + (tickCents / 50) * 180;
  const centsAngle = logicalTickAngle - 180;
  const outerTargetAngleRaw = -ringMidiNormalized * 30;
  const ringRotationDeg = React.useMemo(
    () =>
      outerRotation.interpolate({
        inputRange: [-1080, 1080],
        outputRange: ['-1080deg', '1080deg'],
      }),
    [outerRotation],
  );
  const innerRingRotationDeg = React.useMemo(
    () =>
      innerCentsRotation.interpolate({
        inputRange: [-7200, 7200],
        outputRange: ['-7200deg', '7200deg'],
      }),
    [innerCentsRotation],
  );
  const ringRotationInv = React.useMemo(
    () => Animated.multiply(outerRotation, -1),
    [outerRotation],
  );
  const ringRotationInvDeg = React.useMemo(
    () =>
      ringRotationInv.interpolate({
        inputRange: [-1080, 1080],
        outputRange: ['-1080deg', '1080deg'],
      }),
    [ringRotationInv],
  );
  const levelDbValue = pitch.levelDb ?? -120;
  const debugRows = React.useMemo(() => {
    const frequency =
      pitch.frequency !== null && Number.isFinite(pitch.frequency)
        ? `${pitch.frequency.toFixed(2)} Hz`
        : 'n/a';
    const audioLevel = Number.isFinite(pitch.levelDb)
      ? `${pitch.levelDb.toFixed(1)} dB`
      : hasFreshSignal
        ? 'n/a'
        : '-120.0 dB';
    const confidence =
      pitch.confidence !== null && Number.isFinite(pitch.confidence)
        ? `${Math.round(pitch.confidence * 100)}%`
        : '0%';
    return [
      { label: 'Sharing', value: permission === 'granted' ? 'Yes' : 'No' },
      { label: 'Listening', value: listening ? 'Yes' : 'No' },
      { label: 'Frequency', value: frequency },
      { label: 'Audio Level', value: audioLevel },
      { label: 'Confidence', value: confidence },
    ];
  }, [
    audioActive,
    hasFreshSignal,
    listening,
    permission,
    pitch.confidence,
    pitch.frequency,
    pitch.levelDb,
  ]);
  const debugOverlay = (
    <View pointerEvents="box-none" style={styles.debugOverlay}>
      {showDebug ? (
        <View style={styles.debugPanel}>
          {debugRows.map((row) => (
            <View key={row.label} style={styles.debugRow}>
              <View style={styles.debugCell}>
                <Text style={styles.debugText}>{row.label}</Text>
              </View>
              <View style={styles.debugCell}>
                <Text style={styles.debugText}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setShowDebug((prev) => !prev);
        }}
        style={styles.debugToggle}
      >
        <Image
          accessibilityLabel="Toggle debug panel"
          source={require('../../assets/bug.png')}
          style={styles.debugIcon}
        />
      </Pressable>
    </View>
  );

  const ringContent = (
    <View style={[styles.ringWrapper, { width: ringSize, height: ringSize }]}>
      <Animated.View
        style={[
          styles.ring,
          isWeb ? styles.ringWeb : styles.ringNative,
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
          const noteColor = dialColorForAngle(snapToMinorTick(angle + outerAngle), true);
          return (
            <View
              key={stem}
              style={[
                styles.notePillWrap,
                {
                  transform: [{ rotate: `${angle}deg` }, { translateY: -noteRadius }],
                },
              ]}
            >
              <Text
                style={[
                  styles.noteText,
                  isWeb ? styles.noteTextWeb : styles.noteTextNative,
                  {
                    color: noteColor,
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
        pointerEvents="none"
        style={[
          styles.minorTickLayer,
          {
            width: ringSize,
            height: ringSize,
            transform: [{ rotate: ringRotationDeg }],
          },
        ]}
      >
        {MINOR_TICKS.map((angle) => {
          const shiftedAngle = angle + outerAngle;
          const isMajor = angle % 30 === 0;
          const tickColor = dialColorForAngle(snapToMinorTick(shiftedAngle), isMajor);
          return (
            <View
              key={`tick-${angle}`}
              style={[
                styles.minorTickWrap,
                {
                  transform: [{ rotate: `${angle}deg` }, { translateY: -minorTickRadius }],
                },
              ]}
            >
              <View
                style={[
                  isMajor ? styles.majorTick : styles.minorTick,
                  { backgroundColor: tickColor },
                ]}
              />
            </View>
          );
        })}
      </Animated.View>
      <View
        pointerEvents="none"
        style={[
          styles.topTick,
          {
            top: ringSize / 2 - ringRadius + 6 + topTickOffset,
            height: topTickHeight,
            backgroundColor: dialColorForAngle(0, true),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.innerRing,
          isWeb ? styles.innerRingWeb : styles.innerRingNative,
          {
            width: innerRingSize,
            height: innerRingSize,
            borderRadius: innerRingRadius,
            transform: [{ scale: swellScale }, { rotate: innerRingRotationDeg }],
          },
        ]}
      >
        {showTick ? (
          <View
            style={[
              styles.innerTickWrap,
              {
                transform: [{ rotate: '0deg' }, { translateY: -innerRingRadius }],
              },
            ]}
          >
            <View style={[styles.innerTick, { height: fineTickHeight }]} />
          </View>
        ) : null}
      </Animated.View>
      <View style={styles.centerOverlay}>
        <View style={[styles.dotRing, !showDots && styles.dotRingHidden]} testID="center-note">
          {Array.from({ length: DOT_RING_COUNT }, (_, index) => {
            const angle = (index / DOT_RING_COUNT) * Math.PI * 2;
            const dotX = Math.cos(angle) * DOT_RING_RADIUS;
            const dotY = Math.sin(angle) * DOT_RING_RADIUS;
            const phase = Animated.modulo(Animated.add(ellipsisPhase, index / DOT_RING_COUNT), 1);
            const opacity = phase.interpolate({
              inputRange: [0, 0.2, 0.5, 1],
              outputRange: [0.2, 1, 0.25, 0.2],
              extrapolate: 'clamp',
            });
            const dotColor = '#e2e8f0';
            return (
              <Animated.View
                key={`dot-${index}`}
                style={[
                  styles.dotRingPoint,
                  {
                    opacity,
                    backgroundColor: dotColor,
                    transform: [{ translateX: dotX }, { translateY: dotY }],
                  },
                ]}
              />
            );
          })}
        </View>
        {showNote ? (
          <View style={styles.centerNoteWrap} pointerEvents="none">
            <Text
              style={[
                styles.centerNote,
                isWeb ? styles.centerNoteWeb : styles.centerNoteNative,
                { color: inTune ? '#22c55e' : '#e2e8f0' },
              ]}
              testID="center-note"
            >
              {noteLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
  const mainContent = (
    <View style={styles.mainContent}>
      <AdBanner style={styles.adBanner} />
      <View style={styles.ringSlot}>{ringContent}</View>
    </View>
  );

  React.useEffect(() => {
    if (!showTick) {
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
      useNativeDriver: !isWeb,
    }).start();
  }, [allowMotion, isWeb, outerRotation, outerTargetAngleRaw, showTick]);

  React.useEffect(() => {
    if (!showTick) {
      return;
    }
    const target = allowMotion ? centsAngle : 0;
    const prev = innerContinuousAngleRef.current;
    let next = target;
    while (next - prev > 180) {
      next -= 360;
    }
    while (next - prev < -180) {
      next += 360;
    }
    innerContinuousAngleRef.current = next;
    Animated.timing(innerCentsRotation, {
      toValue: next,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: !isWeb,
    }).start();
  }, [allowMotion, centsAngle, innerCentsRotation, isWeb, showTick]);

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
        {Platform.OS === 'web' ? (
          <View style={styles.webScaleWrap}>
            <View style={[styles.webViewport, webFrameSize]}>
              <View
                style={[
                  styles.webFrame,
                  {
                    width: BASE_FRAME_WIDTH,
                    height: BASE_FRAME_HEIGHT,
                    transform: [{ scale: webScale }],
                  },
                ]}
              >
                {mainContent}
              </View>
              {debugOverlay}
            </View>
          </View>
        ) : (
          <>
            {mainContent}
            {debugOverlay}
          </>
        )}
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
    backgroundColor: 'transparent',
    gap: 28,
    paddingHorizontal: 0,
    paddingVertical: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  adBanner: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  ringSlot: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    position: 'relative',
  },
  webViewport: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage:
      'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.15), transparent 45%), radial-gradient(circle at 80% 20%, rgba(192, 38, 211, 0.14), transparent 40%), radial-gradient(circle at 50% 85%, rgba(14, 165, 233, 0.18), transparent 48%)',
    overflow: 'hidden',
    position: 'relative',
  },
  webScaleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#0b1117',
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.55)',
    overflow: 'visible',
    elevation: 0,
  },
  ringWeb: {
    borderColor: 'rgba(125, 211, 252, 0.65)',
    boxShadow: '0 0 16px rgba(56, 189, 248, 0.3)',
  },
  ringNative: {
    shadowColor: '#38bdf8',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  topTick: {
    position: 'absolute',
    left: '50%',
    width: 1,
    marginLeft: -0.5,
    backgroundColor: '#22c55e',
    pointerEvents: 'none',
    elevation: 6,
    zIndex: 6,
    boxShadow: '0 0 16px rgba(34, 197, 94, 0.7)',
  },
  innerRing: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a1016',
    borderWidth: 0,
    borderColor: 'transparent',
    elevation: 0,
  },
  innerRingWeb: {
    borderColor: 'transparent',
    boxShadow: 'none',
  },
  innerRingNative: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  minorTickLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minorTickWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minorTick: {
    width: 1,
    height: 30,
    borderRadius: 2,
    backgroundColor: 'rgba(226, 232, 240, 0.35)',
  },
  majorTick: {
    width: 1.5,
    height: 48,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
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
  noteText: {
    fontSize: 22,
    letterSpacing: 1.4,
    fontFamily: 'LatoBlack',
    color: '#e2e8f0',
  },
  noteTextWeb: {
    color: '#f8fafc',
    textShadow:
      '0 0 2px rgba(248, 250, 252, 0.9), 0 0 10px rgba(15, 23, 42, 0.8), 0 0 22px rgba(56, 189, 248, 0.9)',
  },
  noteTextNative: {
    textShadowColor: 'rgba(248, 250, 252, 0.9)',
    textShadowRadius: 2,
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
  centerNoteWrap: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerNote: {
    fontSize: 44,
    lineHeight: 44,
    letterSpacing: 3,
    color: '#e2e8f0',
    fontFamily: 'LatoBlack',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  centerNoteWeb: {
    color: '#e2e8f0',
    textShadow: '0 0 18px rgba(56, 189, 248, 0.5), 0 0 28px rgba(192, 38, 211, 0.35)',
  },
  centerNoteNative: {
    textShadowColor: 'rgba(56, 189, 248, 0.5)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  ellipsisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dotRing: {
    width: DOT_RING_RADIUS * 2 + 6,
    height: DOT_RING_RADIUS * 2 + 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRingHidden: {
    opacity: 0,
  },
  dotRingPoint: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
  },
  innerTickWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerTick: {
    width: 2,
    height: 26,
    borderRadius: 2,
    backgroundColor: '#22c55e',
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
  debugOverlay: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    alignItems: 'flex-end',
  },
  debugToggle: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  debugIcon: {
    width: 88,
    height: 88,
    opacity: 0.9,
  },
  debugPanel: {
    marginBottom: 10,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 10,
    minWidth: 320,
  },
  debugRow: {
    flexDirection: 'row',
  },
  debugCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  debugText: {
    color: '#e2e8f0',
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'LatoRegular',
    textAlign: 'center',
  },
});
