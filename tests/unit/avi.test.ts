import { test, expect } from 'vitest'
import { muxMjpegAvi } from '../../src/lib/video/avi'

const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

// Two tiny fake "JPEG" payloads (content is opaque to the muxer).
const f1 = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]) // 7 bytes (odd -> padded)
const f2 = new Uint8Array([0xff, 0xd8, 9, 8, 0xff, 0xd9]) // 6 bytes (even)

test('muxes a RIFF/AVI container with the right top-level structure', () => {
  const out = muxMjpegAvi([f1, f2], { width: 240, height: 240, fps: 10 })
  expect(fourcc(out, 0)).toBe('RIFF')
  expect(u32(out, 4)).toBe(out.length - 8) // RIFF size = total - 8
  expect(fourcc(out, 8)).toBe('AVI ')
})

test('reports the frame count in the index', () => {
  const out = muxMjpegAvi([f1, f2], { width: 240, height: 240, fps: 10 })
  const s = new TextDecoder('latin1').decode(out)
  const idx = s.indexOf('idx1')
  expect(idx).toBeGreaterThan(0)
  expect(u32(out, idx + 4)).toBe(2 * 16) // one 16-byte entry per frame
})

test('a strict size-walk reaches every top-level chunk (LIST sizes include their fourcc)', () => {
  // A RIFF LIST size field must count the 4-byte list type ('hdrl'/'movi'/...).
  // Walking by declared sizes must land exactly on each chunk and end at the
  // RIFF boundary; a 4-byte-short LIST misaligns a strict size-walking parser.
  const out = muxMjpegAvi([f1, f2], { width: 240, height: 240, fps: 10 })
  const u32 = (o: number) =>
    (out[o] | (out[o + 1] << 8) | (out[o + 2] << 16) | (out[o + 3] << 24)) >>> 0
  const riffEnd = 8 + u32(4)
  const seen: string[] = []
  let p = 12 // skip 'RIFF' size 'AVI '
  while (p + 8 <= riffEnd) {
    const id = fourcc(out, p)
    const size = u32(p + 4)
    seen.push(id === 'LIST' ? `LIST:${fourcc(out, p + 8)}` : id)
    p += 8 + size + (size & 1)
  }
  expect(p).toBe(riffEnd) // landed exactly on the boundary, no drift
  expect(seen).toContain('LIST:hdrl')
  expect(seen).toContain('LIST:movi')
  expect(seen).toContain('idx1')
})

test('advertises a stream buffer at least as large as the biggest frame', () => {
  // A reader that allocates dwSuggestedBufferSize and reads frames into it would
  // overflow if we leave it 0. It must cover the largest frame.
  const big = new Uint8Array(5000)
  big[0] = 0xff
  const out = muxMjpegAvi([f1, big], { width: 240, height: 240, fps: 10 })
  const s = new TextDecoder('latin1').decode(out)
  const strh = s.indexOf('strh')
  // strh fourcc + 8 (chunk header) + 36 (offset of dwSuggestedBufferSize in the struct)
  expect(u32(out, strh + 44)).toBeGreaterThanOrEqual(5000)
})

test('embeds each frame as a 00dc chunk, padded to even length', () => {
  const out = muxMjpegAvi([f1, f2], { width: 240, height: 240, fps: 10 })
  const s = new TextDecoder('latin1').decode(out)
  const movi = s.indexOf('movi')
  expect(fourcc(out, movi + 4)).toBe('00dc')
  expect(u32(out, movi + 8)).toBe(7) // f1 length (unpadded size field)
  // f1 (7) padded to 8, so the next chunk id is at movi+4 + 8 (header) + 8 (padded data)
  expect(fourcc(out, movi + 4 + 8 + 8)).toBe('00dc')
})
