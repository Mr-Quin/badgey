import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpSink } from '../../src/lib/log/sinks/http'
import type { LogEntry } from '../../src/lib/log/types'

const entry: LogEntry = { ts: 1, level: 'debug', scope: 'badge', args: ['x'] }

// Track every sink so we can detach its window listeners after each test.
const created: HttpSink[] = []
function make(opts?: ConstructorParameters<typeof HttpSink>[0]): HttpSink {
  const s = new HttpSink(opts)
  created.push(s)
  return s
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const s of created) s.dispose()
  created.length = 0
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('debounces writes into one batched POST', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  const sink = make({ sessionId: 's1', endpoint: '/__devlog', debounceMs: 250 })

  sink.write(entry)
  sink.write(entry)
  expect(fetchMock).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(250)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/__devlog')
  const body = JSON.parse(init.body as string)
  expect(body.sessionId).toBe('s1')
  expect(body.entries).toHaveLength(2)
})

test('flushes immediately when the buffer reaches maxBatch', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  const sink = make({ sessionId: 's1', maxBatch: 2, debounceMs: 9999 })

  sink.write(entry)
  sink.write(entry)
  await Promise.resolve()
  await Promise.resolve()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('never throws when fetch rejects', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
  vi.stubGlobal('fetch', fetchMock)
  const sink = make({ sessionId: 's1', debounceMs: 10 })
  sink.write(entry)
  // Reaching the next line means the flush ran and the rejection was swallowed
  // (an unswallowed rejection would surface as an unhandled rejection / throw).
  await vi.advanceTimersByTimeAsync(10)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('flushes remaining entries via sendBeacon on pagehide', () => {
  const beacon = vi.fn().mockReturnValue(true)
  vi.stubGlobal('navigator', { sendBeacon: beacon })
  const sink = make({ sessionId: 's1', debounceMs: 9999 })
  sink.write(entry)
  window.dispatchEvent(new Event('pagehide'))
  expect(beacon).toHaveBeenCalledTimes(1)
  expect(beacon.mock.calls[0][0]).toBe('/__devlog')
})

test('dispose detaches the page-lifecycle listeners', () => {
  const beacon = vi.fn().mockReturnValue(true)
  vi.stubGlobal('navigator', { sendBeacon: beacon })
  const sink = make({ sessionId: 's1', debounceMs: 9999 })
  sink.dispose()
  sink.write(entry)
  window.dispatchEvent(new Event('pagehide'))
  expect(beacon).not.toHaveBeenCalled()
})
