import type { LogEntry, LogLevel, LogSink } from '../types'

const METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  event: 'debug',
}

/** Mirrors entries to the browser console. Only constructed in DEV, so it needs
 *  no runtime gate. Uses native console args so objects stay inspectable. */
export class ConsoleSink implements LogSink {
  write(e: LogEntry): void {
    const fn = console[METHOD[e.level]]
    const prefix = `[${e.scope}]`
    if (e.level === 'event') {
      const tail = e.data === undefined ? [] : [e.data]
      fn(prefix, `event:${e.event ?? ''}`, ...tail)
    } else {
      fn(prefix, ...e.args)
    }
  }
}
