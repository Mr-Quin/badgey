import { test, expect, afterEach } from 'vitest'
import { Logger } from '../../src/lib/log/logger'
import { captureErrors } from '../../src/lib/log/inputs/errors'
import type { LogEntry } from '../../src/lib/log/types'

let uninstall: (() => void) | null = null
afterEach(() => {
  uninstall?.()
  uninstall = null
})

test('forwards window error events to the error scope', () => {
  const entries: LogEntry[] = []
  const log = new Logger([{ write: (e) => entries.push(e) }])
  uninstall = captureErrors(log)

  window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))

  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ level: 'error', scope: 'error' })
  expect(entries[0].args).toContain('boom')
})

test('forwards unhandled rejections', () => {
  const entries: LogEntry[] = []
  const log = new Logger([{ write: (e) => entries.push(e) }])
  uninstall = captureErrors(log)

  const ev = new Event('unhandledrejection') as Event & { reason?: unknown }
  ev.reason = 'nope'
  window.dispatchEvent(ev)

  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ level: 'error', scope: 'error' })
  expect(entries[0].args).toContain('nope')
})

test('uninstall removes the listeners', () => {
  const entries: LogEntry[] = []
  const log = new Logger([{ write: (e) => entries.push(e) }])
  captureErrors(log)()
  window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
  expect(entries).toHaveLength(0)
})
