import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PermissionState } from '@hooks/usePitchDetection';

export interface MicPermissionScreenProps {
  /** Current microphone permission status used to tailor the call-to-action copy. */
  permission: PermissionState;
  /** Opens the system settings screen so the user can re-enable microphone access. */
  onOpenSettings: () => void;
  /** Optional retry hook to re-trigger the permission flow without leaving the app. */
  onRequestPermission?: () => void;
}

export const MicPermissionScreen: React.FC<MicPermissionScreenProps> = ({
  permission,
  onOpenSettings,
  onRequestPermission,
}) => {
  const isDenied = permission === 'denied';
  const primaryAction = isDenied ? onOpenSettings : onRequestPermission ?? onOpenSettings;
  const primaryLabel = isDenied ? 'Open Settings' : 'Allow Microphone Access';

  const explainerText = isDenied
    ? 'Microphone access is currently blocked. Enable it again to keep tuning in real time.'
    : 'Tine listens to your instrument to keep you in tune. We only use the mic for live pitch detection while you are tuning.';

  return (
    <View style={styles.container}>
      <View style={styles.headerBadge}>
        <Text style={styles.headerIcon}>🎤</Text>
      </View>
      <Text style={styles.title}>Microphone access needed</Text>
      <Text style={styles.message}>{explainerText}</Text>
      <Pressable
        onPress={primaryAction}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel={
          isDenied
            ? 'Open system settings to enable microphone access'
            : 'Request microphone access to enable pitch detection'
        }
      >
        <Text style={styles.primaryLabel}>{primaryLabel}</Text>
      </Pressable>
      {isDenied ? (
        <Text style={styles.caption}>
          If you previously denied permission, open your device settings to re-enable the
          microphone so Tine can hear your instrument.
        </Text>
      ) : null}
      {!isDenied && onRequestPermission ? (
        <Pressable
          onPress={onRequestPermission}
          accessibilityRole="button"
          accessibilityLabel="Retry microphone permission request"
        >
          <Text style={styles.secondaryLabel}>Retry permission request</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    paddingHorizontal: 28,
    gap: 16,
  },
  headerBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  headerIcon: {
    fontSize: 32,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  caption: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  secondaryLabel: {
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
});

export default MicPermissionScreen;
