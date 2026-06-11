import type { LogEntry, LogLevel, LogSink, ScopedLogger } from './types'

/** Fans log entries out to a set of sinks. Inputs (dlog, error capture, custom
 *  events) call this; sinks (console, http) consume entries. Both ends are
 *  pluggable — see addSink() and the ScopedLogger returned by child(). */
export class Logger {
  private sinks: LogSink[]

  constructor(sinks: LogSink[] = []) {
    this.sinks = sinks
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink)
  }

  private emit(
    level: LogLevel,
    scope: string,
    args: unknown[],
    event?: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = { ts: Date.now(), level, scope, args }
    if (event !== undefined) entry.event = event
    if (data !== undefined) entry.data = data
    for (const s of this.sinks) s.write(entry)
  }

  debug(scope: string, ...args: unknown[]): void {
    this.emit('debug', scope, args)
  }
  info(scope: string, ...args: unknown[]): void {
    this.emit('info', scope, args)
  }
  warn(scope: string, ...args: unknown[]): void {
    this.emit('warn', scope, args)
  }
  error(scope: string, ...args: unknown[]): void {
    this.emit('error', scope, args)
  }
  /** Insert a structured, greppable event into the same stream. */
  event(scope: string, name: string, data?: Record<string, unknown>): void {
    this.emit('event', scope, [], name, data)
  }

  child(scope: string): ScopedLogger {
    return {
      debug: (...a) => this.debug(scope, ...a),
      info: (...a) => this.info(scope, ...a),
      warn: (...a) => this.warn(scope, ...a),
      error: (...a) => this.error(scope, ...a),
      event: (name, data) => this.event(scope, name, data),
    }
  }

  async flush(): Promise<void> {
    for (const s of this.sinks) await s.flush?.()
  }
}
