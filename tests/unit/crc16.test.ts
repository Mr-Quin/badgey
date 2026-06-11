import { test, expect } from 'vitest'
import { crc16 } from '../../src/lib/badge/crc16'

test('crc16 of 0..15', () => {
  const data = Uint8Array.from(Array.from({ length: 16 }, (_, i) => i))
  expect(crc16(data)).toBe(0x513d)
})

test('crc16 of "123456789"', () => {
  expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x31c3)
})
