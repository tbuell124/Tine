import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';

import { usePitchDetection } from '@hooks/usePitchDetection';
import { usePitchLock } from '@hooks/usePitchLock';
import { MicPermissionScreen } from '@components/MicPermissionScreen';
import { useTuner } from '@state/TunerStateContext';
import { midiToNoteName } from '@utils/music';

const MAX_DEVIATION = 50;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const TunerScreen: React.FC = () => {
  const { permission, requestPermission, openSettings, listening } = usePitchDetection();
  const showPermissionScreen = permission === 'denied';
  const { state } = useTuner();
  const { width } = useWindowDimensions();
  const { locked } = usePitchLock({
    cents: state.pitch.cents,
    midi: state.pitch.midi,
    thresholdCents: state.settings.lockThreshold,
    dwellTimeMs: state.settings.lockDwellTime * 1000,
  });

  if (showPermissionScreen) {
    return (
      <MicPermissionScreen
        onOpenSettings={openSettings}
        onRequestPermission={() => {
          void requestPermission();
        }}
      />
    );
  }

  const deviation = clamp(state.pitch.cents, -MAX_DEVIATION, MAX_DEVIATION);
  const isInTune = state.pitch.midi !== null && Math.abs(state.pitch.cents) <= 3;
  const indicatorColor = isInTune ? '#22c55e' : '#ef4444';

  const isSignalWeak = state.signal.phase === 'listening' || state.signal.phase === 'dropout';

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

    if (state.settings.manualMode && state.pitch.noteName) {
      return formatStem(state.pitch.noteName);
    }

    if (isSignalWeak) {
      return '-';
    }

    if (state.pitch.noteName) {
      return formatStem(state.pitch.noteName);
    }

    if (state.pitch.midi !== null) {
      return formatStem(midiToNoteName(Math.round(state.pitch.midi)));
    }

    return '—';
  }, [isSignalWeak, state.pitch.midi, state.pitch.noteName, state.settings.manualMode]);

  const meterWidth = React.useMemo(() => Math.min(Math.max(width - 40, 220), 380), [width]);
  const indicatorTravel = (meterWidth - 32) / 2;
  const targetTranslation = React.useMemo(
    () => (deviation / MAX_DEVIATION) * indicatorTravel,
    [deviation, indicatorTravel]
  );

  const indicatorX = useSharedValue(0);
  React.useEffect(() => {
    indicatorX.value = withTiming(targetTranslation, { duration: 120 });
  }, [indicatorX, targetTranslation]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    backgroundColor: indicatorColor
  }));

  const listeningPulse = useSharedValue(0);

  React.useEffect(() => {
    if (listening) {
      listeningPulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
      return;
    }

    listeningPulse.value = withTiming(0, { duration: 220 });
  }, [listening, listeningPulse]);

  const listeningStyle = useAnimatedStyle(() => ({
    opacity: listening ? 0.55 + listeningPulse.value * 0.35 : 0.18,
    transform: [{ scale: 0.9 + listeningPulse.value * 0.2 }],
  }));

  const statusMessage = React.useMemo(() => {
    if (state.settings.manualMode) {
      return 'Manual mode — live updates paused';
    }

    switch (state.signal.phase) {
      case 'listening':
        return '– Listening for a clear signal';
      case 'stabilizing':
        return '– Stabilizing input';
      case 'dropout':
        return '– Signal lost; holding last pitch';
      case 'tracking':
      default:
        if (locked) {
          return 'Pitch locked — steady';
        }
        return 'Tracking live pitch';
    }
  }, [locked, state.settings.manualMode, state.signal.phase]);

  const centerZoneColor = isInTune ? '#14532d' : '#3f0c0c';
  const meterShellColor = isInTune ? '#0b1224' : '#2b0b0b';
  const meterBaseColor = isInTune ? '#0f172a' : '#401010';

  return (
    <View style={styles.screen}>
      <View style={styles.statusRow}>
        <Animated.View
          style={[styles.listeningDot, listeningStyle]}
          accessibilityLabel={listening ? 'Microphone listening' : 'Microphone idle'}
          accessibilityRole="text"
        />
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>
      <View style={[styles.meterShell, { width: meterWidth, backgroundColor: meterShellColor }]}>
        <View style={[styles.meterBase, { backgroundColor: meterBaseColor }]} />
        <View style={[styles.inTuneZone, { backgroundColor: centerZoneColor }]} />
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      </View>
      <Text style={[styles.noteLabel, { color: indicatorColor }]}>{noteLabel}</Text>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0b1224',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderColor: '#1f2937',
    borderWidth: 1
  },
  listeningDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: 14,
    letterSpacing: 0.2,
    flexShrink: 1
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
  noteLabel: {
    fontSize: 120,
    fontWeight: '800',
    letterSpacing: 6
  }
});
