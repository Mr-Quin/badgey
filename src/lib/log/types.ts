export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'event'

export interface LogEntry {
  ts: number
  level: LogLevel
  scope: string
  args: unknown[]
  event?: string
  data?: Record<string, unknown>
}

export interface LogSink {
  write(entry: LogEntry): void
  flush?(): void | Promise<void>
}

export interface ScopedLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  event(name: string, data?: Record<string, unknown>): void
}
