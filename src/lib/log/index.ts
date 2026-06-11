import { Logger } from './logger'
import { ConsoleSink } from './sinks/console'
import { HttpSink } from './sinks/http'
import { captureErrors } from './inputs/errors'

export { Logger } from './logger'
export { ConsoleSink } from './sinks/console'
export { HttpSink } from './sinks/http'
export { captureErrors } from './inputs/errors'
export { formatEntry } from './format'
export type { LogEntry, LogLevel, LogSink, ScopedLogger } from './types'

/** Build the single app logger. In DEV it mirrors to the console and ships to the
 *  dev-log file; in PROD it has no sinks, so logging is a no-op and the sink code
 *  tree-shakes out (the imports above are only used inside the dead DEV branch). */
function build(): Logger {
  if (import.meta.env.DEV) {
    const logger = new Logger([new ConsoleSink(), new HttpSink()])
    captureErrors(logger)
    return logger
  }
  return new Logger([])
}

export const logger = build()

/** Scoped logger for the badge protocol (used by dlog). */
export const badgeLog = logger.child('badge')
