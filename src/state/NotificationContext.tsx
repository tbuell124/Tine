import React from 'react';

export interface Notification {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, 'id'>) => string;
  dismissNotification: (id: string) => void;
}

const NotificationContext = React.createContext<NotificationContextValue | undefined>(undefined);

const DEFAULT_DURATION_MS = 6000;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const timersRef = React.useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  const dismissNotification = React.useCallback((id: string) => {
    const existingTimer = timersRef.current[id];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete timersRef.current[id];
    }

    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const showNotification = React.useCallback(
    (notification: Omit<Notification, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const duration = notification.durationMs ?? DEFAULT_DURATION_MS;
      const payload: Notification = { ...notification, id };

      setNotifications((current) => [...current, payload]);

      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => {
          dismissNotification(id);
        }, duration);
      }

      return id;
    },
    [dismissNotification],
  );

  React.useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    },
    [],
  );

  const value = React.useMemo(
    () => ({ notifications, showNotification, dismissNotification }),
    [notifications, showNotification, dismissNotification],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = (): NotificationContextValue => {
  const context = React.useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }

  return context;
};
