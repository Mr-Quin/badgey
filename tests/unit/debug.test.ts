import { test, expect, vi } from 'vitest'

const calls: unknown[][] = []
vi.mock('../../src/lib/log', () => ({
  badgeLog: { debug: (...a: unknown[]) => calls.push(a) },
}))

const { dlog, hex } = await import('../../src/lib/badge/debug')

test('dlog forwards its args to the badge logger', () => {
  dlog('reconnect', 1)
  expect(calls.at(-1)).toEqual(['reconnect', 1])
})

test('hex formats bytes unchanged', () => {
  expect(hex(Uint8Array.from([0x0a, 0xff]))).toBe('0aff')
})
