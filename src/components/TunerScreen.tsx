import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

import { usePitchLock } from '@hooks/usePitchLock';
import { usePitchDetection } from '@hooks/usePitchDetection';
import { useTuner } from '@state/TunerStateContext';
import {
  midiToEnharmonicNames,
  midiToNoteName,
  MIDI_MAX,
  MIDI_MIN
} from '@utils/music';

const FINE_RANGE = 50;
const BROAD_OFFSETS = [-2, -1, 0, 1, 2] as const;
const FINE_INDICATOR_WIDTH = 16;
const BROAD_INDICATOR_WIDTH = 18;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

interface FineMeterProps {
  percent: number;
  accentColor: string;
  hasPitch: boolean;
  locked: boolean;
}

const FineMeter: React.FC<FineMeterProps> = ({ percent, accentColor, hasPitch, locked }) => {
  const [trackWidth, setTrackWidth] = React.useState(0);
  const progress = useSharedValue(clamp(percent, 0, 1));

  React.useEffect(() => {
    progress.value = withTiming(clamp(percent, 0, 1), {
      duration: locked ? 120 : 220,
      easing: Easing.out(Easing.cubic)
    });
  }, [locked, percent, progress]);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const indicatorStyle = useAnimatedStyle(
    () => {
      const clamped = progress.value < 0 ? 0 : progress.value > 1 ? 1 : progress.value;
      const offset = trackWidth * clamped - FINE_INDICATOR_WIDTH / 2;
      return {
        transform: [{ translateX: offset }]
      };
    },
    [trackWidth]
  );

  return (
    <View style={styles.fineMeterSection}>
      <View style={styles.meterLabelRow}>
        <Text style={styles.meterLabel}>Fine Tuning</Text>
        <Text style={styles.meterLabelSecondary}>±50¢ window</Text>
      </View>
      <View style={styles.fineMeterTrack} onLayout={handleLayout}>
        <View style={styles.fineMeterGuide} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fineMeterIndicator,
            indicatorStyle,
            {
              backgroundColor: hasPitch ? accentColor : '#475569',
              opacity: hasPitch ? 1 : 0.35
            }
          ]}
        />
      </View>
      <View style={styles.fineMeterTicks}>
        <Text style={styles.tickLabel}>-50¢</Text>
        <Text style={styles.tickLabelCenter}>0¢</Text>
        <Text style={styles.tickLabel}>+50¢</Text>
      </View>
    </View>
  );
};

interface BroadMeterProps {
  percent: number;
  segments: { label: string; highlight: boolean }[];
  accentColor: string;
  hasPitch: boolean;
}

const BroadMeter: React.FC<BroadMeterProps> = ({ percent, segments, accentColor, hasPitch }) => {
  const [trackWidth, setTrackWidth] = React.useState(0);
  const progress = useSharedValue(clamp(percent, 0, 1));

  React.useEffect(() => {
    progress.value = withTiming(clamp(percent, 0, 1), {
      duration: 260,
      easing: Easing.out(Easing.cubic)
    });
  }, [percent, progress]);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const indicatorStyle = useAnimatedStyle(
    () => {
      const clamped = progress.value < 0 ? 0 : progress.value > 1 ? 1 : progress.value;
      const offset = trackWidth * clamped - BROAD_INDICATOR_WIDTH / 2;
      return {
        transform: [{ translateX: offset }]
      };
    },
    [trackWidth]
  );

  return (
    <View style={styles.broadMeterSection}>
      <View style={styles.meterLabelRow}>
        <Text style={styles.meterLabel}>Pitch Drift</Text>
        <Text style={styles.meterLabelSecondary}>Neighbouring semitone overview</Text>
      </View>
      <View style={styles.broadMeterTrack} onLayout={handleLayout}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.broadMeterIndicator,
            indicatorStyle,
            {
              backgroundColor: hasPitch ? accentColor : '#475569',
              opacity: hasPitch ? 0.95 : 0.35
            }
          ]}
        />
      </View>
      <View style={styles.broadMeterLabels}>
        {segments.map((segment, index) => (
          <View key={`${segment.label}-${index}`} style={styles.broadLabelWrapper}>
            <Text
              style={[
                styles.broadLabel,
                segment.highlight ? styles.broadLabelActive : null
              ]}
            >
              {segment.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export const TunerScreen: React.FC = () => {
  const {
    state: { pitch, signal, settings }
  } = useTuner();
  const { available, permission, requestPermission } = usePitchDetection();
  const lockState = usePitchLock({
    cents: pitch.cents,
    midi: pitch.midi,
    thresholdCents: settings.lockThreshold,
    dwellTimeMs: settings.lockDwellTime * 1000
  });

  const midiValue = pitch.midi;
  const hasPitch = midiValue !== null && pitch.noteName !== null;
  const displayNote = React.useMemo(() => {
    if (pitch.noteName) {
      return pitch.noteName;
    }
    if (midiValue === null) {
      return null;
    }
    return midiToNoteName(Math.round(midiValue));
  }, [midiValue, pitch.noteName]);

  const enharmonics = React.useMemo(() => {
    if (midiValue === null) {
      return null;
    }
    const rounded = Math.round(midiValue);
    return midiToEnharmonicNames(rounded);
  }, [midiValue]);

  const finePercent = React.useMemo(() => {
    if (midiValue === null) {
      return 0.5;
    }
    const clampedCents = clamp(pitch.cents, -FINE_RANGE, FINE_RANGE);
    return (clampedCents + FINE_RANGE) / (FINE_RANGE * 2);
  }, [midiValue, pitch.cents]);

  const broadSegments = React.useMemo(
    () =>
      BROAD_OFFSETS.map((offset) => {
        if (midiValue === null) {
          return { label: '—', highlight: offset === 0 };
        }
        const center = Math.round(midiValue);
        const note = clamp(center + offset, MIDI_MIN, MIDI_MAX);
        return { label: midiToNoteName(note), highlight: offset === 0 };
      }),
    [midiValue]
  );

  const broadPercent = React.useMemo(() => {
    if (midiValue === null) {
      return 0.5;
    }
    const center = Math.round(midiValue);
    const span = BROAD_OFFSETS[BROAD_OFFSETS.length - 1] - BROAD_OFFSETS[0];
    const start = center + BROAD_OFFSETS[0];
    const percent = (midiValue - start) / span;
    return clamp(percent, 0, 1);
  }, [midiValue]);

  const frequency = React.useMemo(() => {
    if (midiValue === null) {
      return null;
    }
    return settings.a4Calibration * Math.pow(2, (midiValue - 69) / 12);
  }, [midiValue, settings.a4Calibration]);

  const centsDisplay = hasPitch
    ? `${pitch.cents >= 0 ? '+' : ''}${pitch.cents.toFixed(1)}¢`
    : '—';
  const frequencyDisplay = frequency ? `${frequency.toFixed(2)} Hz` : '—';
  const confidencePercent = `${Math.round(clamp(pitch.confidence, 0, 1) * 100)}%`;

  const signalLabel = React.useMemo(() => {
    switch (signal.phase) {
      case 'tracking':
        return lockState.locked ? 'Locked in — strings are on pitch' : 'Tracking live pitch';
      case 'stabilizing':
        return 'Stabilising the incoming signal…';
      case 'dropout':
        return 'Signal dropped — hold the note steady';
      case 'listening':
      default:
        return 'Listening for a clear signal';
    }
  }, [lockState.locked, signal.phase]);

  const detectorBanner = React.useMemo(() => {
    if (!available) {
      return {
        message: 'Pitch engine unavailable. Install the native module and rebuild the app.',
        actionLabel: null
      } as const;
    }

    if (permission === 'denied') {
      return {
        message:
          Platform.OS === 'android'
            ? 'Microphone access was denied. Grant permission to start tuning.'
            : 'Microphone access is disabled. Enable it in Settings to continue tuning.',
        actionLabel: Platform.OS === 'android' ? 'Enable Microphone' : null
      } as const;
    }

    if (permission === 'unknown') {
      return {
        message: 'Requesting microphone access…',
        actionLabel: null
      } as const;
    }

    return null;
  }, [available, permission]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>TunePlay</Text>
        <Text style={styles.tagline}>Reactive Pitch Precision</Text>
      </View>

      <View style={styles.noteReadout}>
        <View style={styles.noteHeaderRow}>
          <Text
            style={[
              styles.noteText,
              lockState.locked ? { color: lockState.accentColor } : null
            ]}
          >
            {displayNote ?? '—'}
          </Text>
          <View
            style={[
              styles.lockBadge,
              lockState.locked ? { borderColor: lockState.accentColor } : null
            ]}
          >
            <View
              style={[
                styles.lockIndicator,
                lockState.locked
                  ? { backgroundColor: lockState.accentColor }
                  : null
              ]}
            />
            <Text
              style={[
                styles.lockText,
                lockState.locked ? { color: lockState.accentColor } : null
              ]}
            >
              {lockState.locked ? 'LOCKED' : 'LIVE'}
            </Text>
          </View>
        </View>
        <Text style={styles.enharmonicText}>
          {enharmonics
            ? enharmonics.sharp === enharmonics.flat
              ? enharmonics.sharp
              : `${enharmonics.sharp} • ${enharmonics.flat}`
            : 'Listening…'}
        </Text>
      </View>

      <FineMeter
        percent={finePercent}
        accentColor={lockState.accentColor}
        hasPitch={hasPitch}
        locked={lockState.locked}
      />

      <BroadMeter
        percent={broadPercent}
        segments={broadSegments}
        accentColor={lockState.accentColor}
        hasPitch={hasPitch}
      />

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Frequency</Text>
          <Text style={styles.metricValue}>{frequencyDisplay}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Cents</Text>
          <Text style={styles.metricValue}>{centsDisplay}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Confidence</Text>
          <Text style={styles.metricValue}>{confidencePercent}</Text>
        </View>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={styles.statusMessage}>{signalLabel}</Text>
      </View>

      {detectorBanner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{detectorBanner.message}</Text>
          {detectorBanner.actionLabel ? (
            <Pressable
              accessibilityRole="button"
              onPress={requestPermission}
              style={styles.bannerAction}
            >
              <Text style={styles.bannerActionText}>{detectorBanner.actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default TunerScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 96,
    paddingBottom: 48,
    paddingHorizontal: 24,
    backgroundColor: '#020617'
  },
  header: {
    marginBottom: 32
  },
  brand: {
    color: '#e2e8f0',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1.2
  },
  tagline: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 14
  },
  noteReadout: {
    marginBottom: 32
  },
  noteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  noteText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 2
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a'
  },
  lockIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: '#475569'
  },
  lockText: {
    color: '#94a3b8',
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '600'
  },
  enharmonicText: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 16,
    letterSpacing: 1
  },
  fineMeterSection: {
    marginBottom: 28
  },
  meterLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  meterLabel: {
    color: '#cbd5f5',
    fontSize: 16,
    fontWeight: '600'
  },
  meterLabelSecondary: {
    color: '#64748b',
    fontSize: 12
  },
  fineMeterTrack: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2a3d',
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative'
  },
  fineMeterGuide: {
    height: 2,
    backgroundColor: '#1d2839',
    marginHorizontal: 24
  },
  fineMeterIndicator: {
    position: 'absolute',
    top: 8,
    width: FINE_INDICATOR_WIDTH,
    height: 32,
    borderRadius: 999,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16
  },
  fineMeterTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6
  },
  tickLabel: {
    color: '#475569',
    fontSize: 11,
    letterSpacing: 0.5
  },
  tickLabelCenter: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  broadMeterSection: {
    marginBottom: 32
  },
  broadMeterTrack: {
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#122033',
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative'
  },
  broadMeterIndicator: {
    position: 'absolute',
    top: 6,
    width: BROAD_INDICATOR_WIDTH,
    height: 24,
    borderRadius: 12,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12
  },
  broadMeterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },
  broadLabelWrapper: {
    flex: 1,
    alignItems: 'center'
  },
  broadLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '500'
  },
  broadLabelActive: {
    color: '#e2e8f0',
    fontWeight: '700'
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#0b1121',
    borderWidth: 1,
    borderColor: '#111e32',
    marginHorizontal: 6
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 6
  },
  metricValue: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600'
  },
  statusCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#132033'
  },
  statusLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 6
  },
  statusMessage: {
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 22
  },
  banner: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#111b2f'
  },
  bannerText: {
    color: '#bfdbfe',
    fontSize: 13,
    lineHeight: 18
  },
  bannerAction: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1d4ed8'
  },
  bannerActionText: {
    color: '#f8fafc',
    fontWeight: '600'
  }
});
