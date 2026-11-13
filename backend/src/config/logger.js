/**
 * Structured JSON Logger for FlowGuard.
 * Supports log levels: error, warn, info, debug.
 * Always formats as structured JSON with ISO timestamps and correlation contexts.
 */
class Logger {
  constructor(defaultContext = {}) {
    this.defaultContext = defaultContext;
  }

  child(context = {}) {
    return new Logger({ ...this.defaultContext, ...context });
  }

  _format(level, message, meta = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...this.defaultContext,
      ...meta,
    });
  }

  info(message, meta) {
    console.log(this._format('info', message, meta));
  }

  warn(message, meta) {
    console.warn(this._format('warn', message, meta));
  }

  error(message, meta) {
    console.error(this._format('error', message, meta));
  }

  debug(message, meta) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'test') {
      console.debug(this._format('debug', message, meta));
    }
  }
}

export const logger = new Logger({ service: 'flowguard-backend' });

