import { test, expect } from 'vitest'
import { parseFileStructs } from '../../src/lib/badge/filestruct'

const fromHex = (h: string) => Uint8Array.from(h.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

test('parses a real captured file entry', () => {
  const buf = fromHex(
    '090000000301002066005f0031003700380031003100300035003100350030002e00610076006900',
  )
  const entries = parseFileStructs(buf)
  expect(entries.length).toBe(1)
  expect(entries[0].file).toBe(true)
  expect(entries[0].dev).toBe(2)
  expect(entries[0].cluster).toBe(3)
  expect(entries[0].num).toBe(1)
  expect(entries[0].name).toBe('f_1781105150.avi')
})
