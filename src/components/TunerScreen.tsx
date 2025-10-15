import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';

import { TunerFace } from './TunerFace';
import { usePitchDetection } from '@hooks/usePitchDetection';

const FACE_MARGIN = 48;

export const TunerScreen: React.FC = () => {
  const { width, height } = useWindowDimensions();
  const faceSize = React.useMemo(() => {
    const minDimension = Math.min(width, height);
    const available = Math.max(minDimension - FACE_MARGIN * 2, 240);
    return Math.round(available);
  }, [height, width]);

  const { available, permission, requestPermission } = usePitchDetection();

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
      <View style={styles.faceContainer}>
        <TunerFace size={faceSize} showDetentPegs />
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
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32
  },
  faceContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  banner: {
    width: '100%',
    marginTop: 16,
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
