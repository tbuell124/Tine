import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface MicPermissionScreenProps {
  /** Opens the system settings screen so the user can re-enable microphone access. */
  onOpenSettings: () => void;
  /** Optional retry hook to re-trigger the permission flow without leaving the app. */
  onRequestPermission?: () => void;
}

export const MicPermissionScreen: React.FC<MicPermissionScreenProps> = ({
  onOpenSettings,
  onRequestPermission,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerBadge}>
        <Text style={styles.headerIcon}>🎤</Text>
      </View>
      <Text style={styles.title}>Microphone access needed</Text>
      <Text style={styles.message}>
        Tine pauses tuning when microphone access is disabled. Re-enable the mic to resume live
        pitch detection.
      </Text>
      <Pressable
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open system settings to enable microphone access"
      >
        <Text style={styles.primaryLabel}>Open Settings</Text>
      </Pressable>
      {onRequestPermission ? (
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
  secondaryLabel: {
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
});

export default MicPermissionScreen;
