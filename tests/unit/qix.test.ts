import { test, expect } from 'vitest'
import { buildQix, QixReassembler } from '../../src/lib/badge/qix'

test('buildQix(0xDC,[0x0C]) structure and checksum', () => {
  const frame = buildQix(0xdc, Uint8Array.from([0x0c]), 0)
  expect(frame[0]).toBe(0x9e)
  expect(frame[3]).toBe(0xdc)
  const flag = (0 << 3) | 0x02
  const chk = (flag + 0xdc + 1 + 0 + 0x0c) & 0xff
  expect(frame[1]).toBe(chk)
  expect(frame[6]).toBe(0x0c)
})

test('QixReassembler parses a built frame', () => {
  const frame = buildQix(0xdc, Uint8Array.from([0x0c]), 0)
  const r = new QixReassembler()
  const result = r.feed(frame)
  expect(result).not.toBeNull()
  expect(result!.cmd).toBe(0xdc)
  expect(Array.from(result!.payload)).toEqual([0x0c])
})
