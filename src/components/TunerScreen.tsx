import React from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { usePitchDetection } from '@hooks/usePitchDetection';
import { MicPermissionScreen } from '@components/MicPermissionScreen';
import { midiToNoteName } from '@utils/music';
import { getMonotonicTime } from '@utils/clock';

const MAX_DEVIATION = 50;
const STALE_SIGNAL_MS = 900;
const CONFIDENCE_THRESHOLD = 0.14;
const LOCK_CONFIDENCE = 0.6;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const TunerScreen: React.FC = () => {
  const { available, permission, requestPermission, openSettings, pitch, listening } =
    usePitchDetection();
  const { width } = useWindowDimensions();
  const [now, setNow] = React.useState(getMonotonicTime());

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(getMonotonicTime());
    }, 250);

    return () => clearInterval(interval);
  }, []);

  if (!available) {
    return (
      <View style={styles.unavailableContainer}>
        <Text style={styles.unavailableTitle}>Pitch detector unavailable</Text>
        <Text style={styles.unavailableMessage}>
          Build or install the custom dev client to load the native pitch detector. Expo Go lacks
          the audio bridge needed for live tuning.
        </Text>
      </View>
    );
  }

  if (permission === 'unknown') {
    return (
      <MicPermissionScreen
        mode="request"
        onRequestPermission={() => {
          void requestPermission();
        }}
      />
    );
  }

  if (permission === 'denied') {
    return (
      <MicPermissionScreen
        mode="denied"
        onOpenSettings={openSettings}
        onRequestPermission={() => {
          void requestPermission();
        }}
      />
    );
  }

  const deviation = clamp(pitch.cents, -MAX_DEVIATION, MAX_DEVIATION);
  const signalAge = pitch.updatedAt > 0 ? Math.max(0, now - pitch.updatedAt) : Infinity;
  const hasFreshSignal = signalAge <= STALE_SIGNAL_MS;
  const hasConfidence = pitch.confidence >= CONFIDENCE_THRESHOLD;
  const hasPitch = pitch.midi !== null && pitch.noteName !== null;
  const isWeakSignal = !hasFreshSignal || !hasConfidence || !hasPitch;
  const isInTune = !isWeakSignal && Math.abs(pitch.cents) <= 3;
  const pitchLocked = isInTune && pitch.confidence >= LOCK_CONFIDENCE;
  const indicatorColor = isInTune ? '#22c55e' : '#ef4444';

  const noteLabel = React.useMemo(() => {
    const formatStem = (note: string): string => {
      const match = note.match(/^([A-G])([#b]?)/i);
      if (!match) {
        return note;
      }

      const [, letter, accidental] = match;
      const accidentalSymbol = accidental === '#' ? '♯' : accidental === 'b' ? '♭' : '';
      return `${letter.toUpperCase()}${accidentalSymbol}`;
    };

    if (!isWeakSignal && pitch.noteName) {
      return formatStem(pitch.noteName);
    }

    if (!isWeakSignal && pitch.midi !== null) {
      return formatStem(midiToNoteName(Math.round(pitch.midi)));
    }

    return '-';
  }, [isWeakSignal, pitch.midi, pitch.noteName]);

  const statusLabel = React.useMemo(() => {
    if (isWeakSignal) {
      return 'Waiting for a clean signal…';
    }

    if (pitchLocked) {
      return 'Pitch locked';
    }

    return 'Live input';
  }, [isWeakSignal, pitchLocked]);

  const listeningPulse = React.useRef(new Animated.Value(1)).current;
  const listeningLoop = React.useRef<Animated.CompositeAnimation | null>(null);

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
            useNativeDriver: true
          }),
          Animated.timing(listeningPulse, {
            toValue: 0.94,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          })
        ])
      );

      listeningLoop.current = loop;
      loop.start();
      return () => loop.stop();
    }

    if (listeningLoop.current) {
      listeningLoop.current.stop();
      listeningLoop.current = null;
    }
    listeningPulse.setValue(1);
  }, [listening, listeningPulse, permission]);

  const meterWidth = React.useMemo(() => Math.min(Math.max(width - 40, 220), 380), [width]);
  const indicatorTravel = (meterWidth - 32) / 2;
  const targetTranslation = React.useMemo(
    () => (deviation / MAX_DEVIATION) * indicatorTravel,
    [deviation, indicatorTravel]
  );

  const indicatorX = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(indicatorX, {
      toValue: targetTranslation,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start();
  }, [indicatorX, targetTranslation]);

  const indicatorStyle = React.useMemo(
    () => ({
      transform: [{ translateX: indicatorX }],
      backgroundColor: indicatorColor
    }),
    [indicatorColor, indicatorX]
  );

  const centerZoneColor = isInTune ? '#14532d' : '#3f0c0c';
  const meterShellColor = isInTune ? '#0b1224' : '#2b0b0b';
  const meterBaseColor = isInTune ? '#0f172a' : '#401010';

  const listeningIndicatorStyle = React.useMemo(
    () => ({
      transform: [{ scale: listeningPulse }],
      backgroundColor: listening ? '#0f172a' : '#111827',
      borderColor: listening ? '#22c55e' : '#1f2937'
    }),
    [listening, listeningPulse]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={[styles.listeningBadge, listeningIndicatorStyle]}>
          <View style={[styles.listeningDot, listening ? styles.listeningDotActive : null]} />
          <Text style={styles.listeningLabel}>{listening ? 'Listening' : 'Idle'}</Text>
        </View>
        <Text style={styles.statusLabel}>{statusLabel}</Text>
      </View>
      <View style={[styles.meterShell, { width: meterWidth, backgroundColor: meterShellColor }]}>
        <View style={[styles.meterBase, { backgroundColor: meterBaseColor }]} />
        <View style={[styles.inTuneZone, { backgroundColor: centerZoneColor }]} />
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      </View>
      <View style={styles.noteRow}>
        <Text style={[styles.noteLabel, { color: indicatorColor }]}>{noteLabel}</Text>
        {!isWeakSignal && pitchLocked ? <Text style={styles.lockLabel}>locked</Text> : null}
      </View>
    </View>
  );
};

export default TunerScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    gap: 32,
    paddingHorizontal: 20
  },
  headerRow: {
    width: '100%',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  listeningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5
  },
  listeningDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1f2937',
    borderWidth: 1.5,
    borderColor: '#111827'
  },
  listeningDotActive: {
    backgroundColor: '#22c55e',
    borderColor: '#bbf7d0'
  },
  listeningLabel: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600'
  },
  statusLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600'
  },
  meterShell: {
    height: 32,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0b1224',
    position: 'relative'
  },
  meterBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
    opacity: 0.9
  },
  inTuneZone: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: '35%',
    borderRadius: 999,
    opacity: 0.9
  },
  indicator: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    top: 2,
    left: '50%',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  noteLabel: {
    fontSize: 120,
    fontWeight: '800',
    letterSpacing: 6
  },
  lockLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 14
  },
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#020617'
  },
  unavailableTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e2e8f0'
  },
  unavailableMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#cbd5e1'
  }
});
