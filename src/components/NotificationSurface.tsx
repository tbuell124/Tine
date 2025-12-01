import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNotifications } from '@state/NotificationContext';

export const NotificationSurface: React.FC = () => {
  const { notifications, dismissNotification } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      {notifications.map((notification) => (
        <View key={notification.id} style={styles.toast} accessibilityRole="alert">
          <View style={styles.textContainer}>
            <Text style={styles.message}>{notification.message}</Text>
            {notification.actionLabel && notification.onAction ? (
              <Pressable
                onPress={() => {
                  notification.onAction?.();
                  dismissNotification(notification.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={notification.actionLabel}
                style={styles.actionButton}
              >
                <Text style={styles.actionLabel}>{notification.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => dismissNotification(notification.id)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            style={styles.dismissButton}
          >
            <Text style={styles.dismissLabel}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 12,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderColor: '#22C55E',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  message: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#22C55E',
  },
  actionLabel: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 13,
  },
  dismissButton: {
    padding: 4,
  },
  dismissLabel: {
    color: '#A5B4FC',
    fontSize: 22,
    lineHeight: 24,
    paddingHorizontal: 4,
  },
});

export default NotificationSurface;
