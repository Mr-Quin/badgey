import { test, expect, vi } from 'vitest'
import { Logger } from '../../src/lib/log/logger'
import type { LogEntry, LogSink } from '../../src/lib/log/types'

function collector(): { sink: LogSink; entries: LogEntry[] } {
  const entries: LogEntry[] = []
  return { sink: { write: (e) => entries.push(e) }, entries }
}

test('fans out entries to all sinks with scope, level, and timestamp', () => {
  const a = collector()
  const b = collector()
  const log = new Logger([a.sink, b.sink])
  log.debug('badge', 'hello', 1)
  expect(a.entries).toHaveLength(1)
  expect(b.entries).toHaveLength(1)
  expect(a.entries[0]).toMatchObject({ level: 'debug', scope: 'badge', args: ['hello', 1] })
  expect(typeof a.entries[0].ts).toBe('number')
})

test('child() binds a scope and supports events', () => {
  const c = collector()
  const badge = new Logger([c.sink]).child('badge')
  badge.warn('careful')
  badge.event('reconnect', { attempt: 2 })
  expect(c.entries[0]).toMatchObject({ level: 'warn', scope: 'badge', args: ['careful'] })
  expect(c.entries[1]).toMatchObject({
    level: 'event',
    scope: 'badge',
    event: 'reconnect',
    data: { attempt: 2 },
  })
})

test('a logger with no sinks is a silent no-op', () => {
  const log = new Logger()
  expect(() => log.error('x', 'boom')).not.toThrow()
})

test('addSink attaches a sink at runtime', () => {
  const c = collector()
  const log = new Logger()
  log.addSink(c.sink)
  log.info('x', 'hi')
  expect(c.entries).toHaveLength(1)
})

test('flush awaits each sink flush', async () => {
  const flushed = vi.fn().mockResolvedValue(undefined)
  const log = new Logger([{ write: () => {}, flush: flushed }])
  await log.flush()
  expect(flushed).toHaveBeenCalled()
})
