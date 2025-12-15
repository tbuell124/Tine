import { Platform } from 'react-native';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEvent {
  id: string;
  level: LogLevel;
  tag: string;
  message: string;
  timestamp: number;
  data?: unknown;
}

const listeners = new Set<(event: LogEvent) => void>();
const buffer: LogEvent[] = [];
const MAX_BUFFER = 50;
let counter = 0;

const enqueue = (event: LogEvent) => {
  buffer.push(event);
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
  }
};

const emit = (event: LogEvent) => {
  enqueue(event);
  listeners.forEach((listener) => listener(event));
};

const formatConsoleMessage = (event: LogEvent) => {
  const time = new Date(event.timestamp).toISOString();
  return `${time} [${Platform.OS}] [${event.tag}] ${event.message}`;
};

const logToConsole = (event: LogEvent) => {
  if (!__DEV__) {
    return;
  }

  const formatted = formatConsoleMessage(event);
  const payload = event.data ? [formatted, event.data] : [formatted];

  switch (event.level) {
    case 'warn':
      console.warn(...payload);
      break;
    case 'error':
      console.error(...payload);
      break;
    case 'info':
    default:
      console.log(...payload);
      break;
  }
};

const createLogEvent = (level: LogLevel, tag: string, message: string, data?: unknown) => {
  const event: LogEvent = {
    id: `${Date.now()}-${counter++}`,
    level,
    tag,
    message,
    data,
    timestamp: Date.now(),
  };

  logToConsole(event);
  emit(event);
  return event;
};

export const logger = {
  info: (tag: string, message: string, data?: unknown) => createLogEvent('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => createLogEvent('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => createLogEvent('error', tag, message, data),
  subscribe: (listener: (event: LogEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getBuffer: () => buffer.slice(-MAX_BUFFER),
};

export type Logger = typeof logger;
