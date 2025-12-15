import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { logger, type LogEvent } from '@utils/logger';

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const levelColor: Record<LogEvent['level'], string> = {
  info: '#a5f3fc',
  warn: '#fbbf24',
  error: '#f87171',
};

export const DebugLogOverlay: React.FC = () => {
  const [events, setEvents] = React.useState<LogEvent[]>(() => logger.getBuffer());

  React.useEffect(() => {
    if (!__DEV__) {
      return undefined;
    }

    return logger.subscribe((event) => {
      setEvents((prev) => {
        const next = [...prev, event];
        if (next.length > 30) {
          next.shift();
        }
        return next;
      });
    });
  }, []);

  if (!__DEV__) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.heading}>Debug log</Text>
        <ScrollView style={styles.scroller} contentContainerStyle={styles.scrollerContent}>
          {events.map((event) => (
            <View key={event.id} style={styles.row}>
              <Text style={[styles.level, { color: levelColor[event.level] }]}>[{event.level}]</Text>
              <Text style={styles.tag}>{event.tag}</Text>
              <Text style={styles.time}>{formatTime(event.timestamp)}</Text>
              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.message}>
                {event.message}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  panel: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: 'rgba(148, 163, 184, 0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
  },
  heading: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  scroller: {
    maxHeight: 140,
  },
  scrollerContent: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  level: {
    fontSize: 11,
    fontWeight: '700',
  },
  tag: {
    color: '#bae6fd',
    fontSize: 11,
    minWidth: 70,
  },
  time: {
    color: '#94a3b8',
    fontSize: 10,
    minWidth: 70,
    textAlign: 'right',
  },
  message: {
    color: '#cbd5e1',
    fontSize: 11,
    flex: 1,
  },
});
