import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface NotificationPayload {
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
  /**
   * Optional key to prevent duplicates. When provided, any existing notification
   * with the same key will be replaced.
   */
  dedupeKey?: string;
  /** Duration in milliseconds before the toast auto-dismisses. */
  durationMs?: number;
}

export interface NotificationItem extends NotificationPayload {
  id: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  pushNotification: (payload: NotificationPayload) => void;
  dismissNotification: (id: string) => void;
}

const DEFAULT_DURATION_MS = 7000;

const NotificationContext = React.createContext<NotificationContextValue | undefined>(
  undefined
);

export const NotificationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissNotification = React.useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushNotification = React.useCallback(
    ({ durationMs, ...payload }: NotificationPayload) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setNotifications((prev) => {
        const filtered = payload.dedupeKey
          ? prev.filter((notification) => {
              const shouldKeep = notification.dedupeKey !== payload.dedupeKey;
              if (!shouldKeep) {
                const timer = timers.current.get(notification.id);
                if (timer) {
                  clearTimeout(timer);
                  timers.current.delete(notification.id);
                }
              }
              return shouldKeep;
            })
          : prev;
        return [...filtered, { ...payload, id }];
      });

      const timeout = setTimeout(() => dismissNotification(id), durationMs ?? DEFAULT_DURATION_MS);
      timers.current.set(id, timeout);
    },
    [dismissNotification]
  );

  React.useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const value = React.useMemo(
    () => ({ notifications, pushNotification, dismissNotification }),
    [notifications, pushNotification, dismissNotification]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export function useNotifications(): NotificationContextValue {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }

  return context;
}

export const NotificationSurface: React.FC = () => {
  const { notifications, dismissNotification } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {notifications.map((notification, index) => (
        <View
          key={notification.id}
          style={[styles.toast, index > 0 ? styles.toastSpacing : null]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.message}>{notification.message}</Text>
          <View style={styles.actionsRow}>
            {notification.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  notification.onActionPress?.();
                  dismissNotification(notification.id);
                }}
                style={styles.action}
              >
                <Text style={styles.actionLabel}>{notification.actionLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => dismissNotification(notification.id)}
              style={styles.dismiss}
            >
              <Text style={styles.dismissLabel}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'column',
  },
  toast: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  message: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  action: {
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  dismiss: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dismissLabel: {
    color: '#cbd5e1',
    fontWeight: '500',
  },
  toastSpacing: {
    marginTop: 12,
  },
});

export default NotificationProvider;
