export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const LOG_PREFIX = '[MotiSig]';
const DEFAULT_LEVEL: LogLevel = 'info';

let currentLevel: LogLevel = DEFAULT_LEVEL;

function isValidLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEVEL_RANK, value);
}

export function setLogLevel(level: LogLevel): void {
  if (!isValidLevel(level)) {
    if (LEVEL_RANK[currentLevel] <= LEVEL_RANK.warn) {
      console.warn(LOG_PREFIX, `ignoring invalid log level: ${String(level)}`);
    }
    return;
  }
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: Exclude<LogLevel, 'silent'>): boolean {
  return LEVEL_RANK[currentLevel] <= LEVEL_RANK[level];
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (!shouldLog('debug')) return;
    console.debug(LOG_PREFIX, message, ...args);
  },
  info(message: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return;
    console.info(LOG_PREFIX, message, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    if (!shouldLog('warn')) return;
    console.warn(LOG_PREFIX, message, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    if (!shouldLog('error')) return;
    console.error(LOG_PREFIX, message, ...args);
  },
};
