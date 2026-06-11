import { test, expect } from 'vitest'
import { formatEntry } from '../../src/lib/log/format'

test('formats a debug entry as a single line', () => {
  const line = formatEntry({
    ts: Date.parse('2026-06-10T19:24:41.123Z'),
    level: 'debug',
    scope: 'badge',
    args: ['rx', 'a1b2'],
  })
  expect(line).toBe('19:24:41.123  DEBUG  [badge]  rx a1b2')
})

test('formats an event entry with its data payload', () => {
  const line = formatEntry({
    ts: Date.parse('2026-06-10T19:24:41.000Z'),
    level: 'event',
    scope: 'badge',
    args: [],
    event: 'reconnect',
    data: { attempt: 2 },
  })
  expect(line).toBe('19:24:41.000  EVENT  [badge]  reconnect {"attempt":2}')
})

test('renders Uint8Array args as hex', () => {
  const line = formatEntry({
    ts: Date.parse('2026-06-10T00:00:00.000Z'),
    level: 'debug',
    scope: 'x',
    args: [Uint8Array.from([0x0a, 0xff])],
  })
  expect(line).toBe('00:00:00.000  DEBUG  [x]  0aff')
})
