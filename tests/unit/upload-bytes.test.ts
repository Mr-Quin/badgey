import { test, expect } from 'vitest'
import { buildStartPayload, buildSubpacket } from '../../src/lib/badge/protocol'
import { crc16 } from '../../src/lib/badge/crc16'

function hex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join(' ')
}

test('buildStartPayload: [size BE4][crc BE2][tmpName bytes]', () => {
  // size 0x00010203, crc 0xABCD, name "ab.tmp\0"
  const p = buildStartPayload(0x00010203, 0xabcd, 'ab.tmp\0')
  expect(hex(p.slice(0, 4))).toBe('00 01 02 03')
  expect(hex(p.slice(4, 6))).toBe('ab cd')
  // "ab.tmp\0" -> 61 62 2e 74 6d 70 00
  expect(hex(p.slice(6))).toBe('61 62 2e 74 6d 70 00')
})

test('buildStartPayload: real-shape size like uploadImage (length BE4)', () => {
  const p = buildStartPayload(5000, 0x1234, 'deadbeef.tmp\0')
  // 5000 = 0x00001388
  expect(hex(p.slice(0, 4))).toBe('00 00 13 88')
  expect(hex(p.slice(4, 6))).toBe('12 34')
})

test('buildSubpacket without crc: [seq][data]', () => {
  const data = Uint8Array.from([0xaa, 0xbb, 0xcc])
  const sub = buildSubpacket(7, data, false, crc16)
  expect(hex(sub)).toBe('07 aa bb cc')
})

test('buildSubpacket with crc: [seq][crc BE2][data]', () => {
  const data = Uint8Array.from([0xaa, 0xbb, 0xcc])
  const c = crc16(data, 0)
  const sub = buildSubpacket(7, data, true, crc16)
  expect(sub[0]).toBe(7)
  expect((sub[1] << 8) | sub[2]).toBe(c)
  expect(hex(sub.slice(3))).toBe('aa bb cc')
})

test('buildSubpacket masks seq to a byte', () => {
  const sub = buildSubpacket(0x107, Uint8Array.from([0x01]), false, crc16)
  expect(sub[0]).toBe(0x07)
})
