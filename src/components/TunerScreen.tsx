import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { usePitchDetection } from '@hooks/usePitchDetection';
import { MicPermissionScreen } from '@components/MicPermissionScreen';
import { midiToNoteName } from '@utils/music';

const MAX_DEVIATION = 50;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const TunerScreen: React.FC = () => {
  const { permission, requestPermission, openSettings, pitch } = usePitchDetection();
  const showPermissionScreen = permission === 'denied';
  const { width } = useWindowDimensions();

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

  const deviation = clamp(pitch.cents, -MAX_DEVIATION, MAX_DEVIATION);
  const isInTune = pitch.midi !== null && Math.abs(pitch.cents) <= 3;
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

    if (pitch.noteName) {
      return formatStem(pitch.noteName);
    }

    if (pitch.midi !== null) {
      return formatStem(midiToNoteName(Math.round(pitch.midi)));
    }

    return '—';
  }, [pitch.midi, pitch.noteName]);

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

  const centerZoneColor = isInTune ? '#14532d' : '#3f0c0c';
  const meterShellColor = isInTune ? '#0b1224' : '#2b0b0b';
  const meterBaseColor = isInTune ? '#0f172a' : '#401010';

  return (
    <View style={styles.screen}>
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
