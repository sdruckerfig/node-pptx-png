import type { LogLevel } from '../types/index.js';

/**
 * Log entry with metadata.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Logger interface for the rendering pipeline.
 */
export interface ILogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(context: string): ILogger;
}

/**
 * Log level priority for filtering.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Console-based logger implementation.
 */
export class Logger implements ILogger {
  private readonly level: LogLevel;
  private readonly context?: string;
  private readonly levelPriority: number;

  constructor(level: LogLevel = 'warn', context?: string) {
    this.level = level;
    this.context = context;
    this.levelPriority = LOG_LEVEL_PRIORITY[level];
  }

  /**
   * Creates a child logger with additional context.
   */
  child(context: string): ILogger {
    const fullContext = this.context ? `${this.context}:${context}` : context;
    return new Logger(this.level, fullContext);
  }

  /**
   * Logs a debug message.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Logs an info message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Logs a warning message.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Logs an error message.
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Internal log method.
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < this.levelPriority) {
      return;
    }

    const prefix = this.context ? `[${this.context}]` : '';
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix} ${message}`;

    switch (level) {
      case 'debug':
        if (data) {
          console.debug(formattedMessage, data);
        } else {
          console.debug(formattedMessage);
        }
        break;
      case 'info':
        if (data) {
          console.info(formattedMessage, data);
        } else {
          console.info(formattedMessage);
        }
        break;
      case 'warn':
        if (data) {
          console.warn(formattedMessage, data);
        } else {
          console.warn(formattedMessage);
        }
        break;
      case 'error':
        if (data) {
          console.error(formattedMessage, data);
        } else {
          console.error(formattedMessage);
        }
        break;
    }
  }
}

/**
 * Creates a logger instance based on the log level.
 * Note: 'silent' level uses the standard Logger with priority filtering,
 * which filters out all log levels (debug, info, warn, error have lower priority than silent).
 */
export function createLogger(level: LogLevel = 'warn', context?: string): ILogger {
  return new Logger(level, context);
}
