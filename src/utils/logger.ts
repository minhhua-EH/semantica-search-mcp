/**
 * Structured logging utility for the application.
 * Provides consistent logging with levels and formatting.
 */

import { LogLevel } from "../models/types.js";

/**
 * Logger configuration.
 */
export interface LoggerConfig {
  level: LogLevel;
  pretty?: boolean;
  prefix?: string;
}

/**
 * Log levels in order of severity.
 */
const LOG_LEVELS = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Log level colors for console output.
 */
const COLORS = {
  [LogLevel.DEBUG]: "\x1b[36m", // Cyan
  [LogLevel.INFO]: "\x1b[32m", // Green
  [LogLevel.WARN]: "\x1b[33m", // Yellow
  [LogLevel.ERROR]: "\x1b[31m", // Red
  reset: "\x1b[0m",
};

/**
 * Simple structured logger.
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = {
      pretty: true,
      ...config,
    };
  }

  /**
   * Check if a log level should be logged.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Format log message.
   */
  private format(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = this.config.prefix ? `[${this.config.prefix}] ` : "";

    if (this.config.pretty) {
      const color = COLORS[level];
      const reset = COLORS.reset;
      const levelStr = level.toUpperCase().padEnd(5);

      let formatted = `${color}${levelStr}${reset} ${timestamp} ${prefix}${message}`;

      if (data !== undefined) {
        formatted += "\n" + JSON.stringify(data, null, 2);
      }

      return formatted;
    }

    // Non-pretty format (JSON)
    return JSON.stringify({
      timestamp,
      level,
      prefix: this.config.prefix,
      message,
      data,
    });
  }

  /**
   * Log debug message.
   */
  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.error(this.format(LogLevel.DEBUG, message, data));
    }
  }

  /**
   * Log info message.
   */
  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(this.format(LogLevel.INFO, message, data));
    }
  }

  /**
   * Log warning message.
   */
  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.error(this.format(LogLevel.WARN, message, data));
    }
  }

  /**
   * Log error message.
   */
  error(message: string, error?: Error | any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const data =
        error instanceof Error
          ? {
              errorMessage: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error;

      console.error(this.format(LogLevel.ERROR, message, data));
    }
  }

  /**
   * Create a child logger with a prefix.
   */
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }
}

/**
 * Default logger instance.
 */
let defaultLogger: Logger;

/**
 * Initialize the default logger.
 */
export function initLogger(config: LoggerConfig): void {
  defaultLogger = new Logger(config);
}

/**
 * Get the default logger instance.
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    // Return a silent no-op logger if not initialized
    // This prevents logging in MCP mode where stdio is used for protocol
    return createSilentLogger();
  }
  return defaultLogger;
}

/**
 * Create a silent no-op logger.
 */
function createSilentLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => createSilentLogger(),
  } as any as Logger;
}

/**
 * Create a new logger instance.
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}
