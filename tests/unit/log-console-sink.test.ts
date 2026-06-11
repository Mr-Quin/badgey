import { test, expect, vi, afterEach } from 'vitest'
import { ConsoleSink } from '../../src/lib/log/sinks/console'

afterEach(() => vi.restoreAllMocks())

test('writes debug entries to console.debug with a scope prefix', () => {
  const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  new ConsoleSink().write({ ts: 0, level: 'debug', scope: 'badge', args: ['hello', 1] })
  expect(spy).toHaveBeenCalledWith('[badge]', 'hello', 1)
})

test('routes error entries to console.error', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  new ConsoleSink().write({ ts: 0, level: 'error', scope: 'x', args: ['boom'] })
  expect(spy).toHaveBeenCalledWith('[x]', 'boom')
})

test('renders events with name and data', () => {
  const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  new ConsoleSink().write({
    ts: 0,
    level: 'event',
    scope: 'badge',
    args: [],
    event: 'reconnect',
    data: { attempt: 2 },
  })
  expect(spy).toHaveBeenCalledWith('[badge]', 'event:reconnect', { attempt: 2 })
})
