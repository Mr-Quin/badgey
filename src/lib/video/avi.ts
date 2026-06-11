/**
 * Mux a sequence of JPEG frames into a Motion-JPEG AVI container the badge can
 * play: 240x240, no audio, one JPEG per frame, indexed by idx1. Pure: takes
 * encoded frames in, returns the container bytes.
 */
export interface AviOpts {
  width: number
  height: number
  fps: number
}

export function muxMjpegAvi(frames: Uint8Array[], opts: AviOpts): Uint8Array {
  const { width, height, fps } = opts
  const n = frames.length

  // movi chunk list (offsets are relative to the 'movi' fourcc).
  const padded = frames.map((f) => f.length + (f.length & 1)) // pad to even
  const moviDataLen = padded.reduce((a, p) => a + 8 + p, 0) // 8-byte chunk header each
  const idxEntries = n

  // Section sizes.
  const AVIH = 64 // 'avih'(4)+size(4)+56 bytes
  const STRH = 64 // 'strh'(4)+size(4)+56 bytes
  const STRF = 48 // 'strf'(4)+size(4)+40 bytes
  const strlData = STRH + STRF
  const strlList = 12 + strlData // 'LIST'(4)+size(4)+'strl'(4) + data
  const hdrlData = AVIH + strlList
  const hdrlList = 12 + hdrlData
  const moviList = 12 + moviDataLen // 'LIST'+size+'movi' + chunks
  const idx1 = 8 + idxEntries * 16 // 'idx1'+size + entries
  const riffData = 4 /* 'AVI ' */ + hdrlList + moviList + idx1
  const total = 8 + riffData
  // dwSuggestedBufferSize: the largest frame, so a reader that pre-allocates a
  // per-frame buffer from this hint sizes it correctly.
  const maxFrame = frames.reduce((m, f) => Math.max(m, f.length), 0)

  const buf = new Uint8Array(total)
  const dv = new DataView(buf.buffer)
  let p = 0
  const fcc = (s: string) => {
    for (let i = 0; i < 4; i++) buf[p++] = s.charCodeAt(i)
  }
  const u32 = (v: number) => {
    dv.setUint32(p, v >>> 0, true)
    p += 4
  }
  const u16 = (v: number) => {
    dv.setUint16(p, v & 0xffff, true)
    p += 2
  }

  // RIFF
  fcc('RIFF')
  u32(riffData)
  fcc('AVI ')

  // LIST hdrl  (a LIST size field counts its 4-byte list type)
  fcc('LIST')
  u32(hdrlData + 4)
  fcc('hdrl')

  // avih
  fcc('avih')
  u32(56)
  u32(Math.round(1e6 / fps)) // dwMicroSecPerFrame
  u32(0) // dwMaxBytesPerSec
  u32(0) // dwPaddingGranularity
  u32(0x10) // dwFlags = AVIF_HASINDEX
  u32(n) // dwTotalFrames
  u32(0) // dwInitialFrames
  u32(1) // dwStreams
  u32(maxFrame) // dwSuggestedBufferSize
  u32(width)
  u32(height)
  u32(0)
  u32(0)
  u32(0)
  u32(0) // dwReserved[4]

  // LIST strl
  fcc('LIST')
  u32(strlData + 4)
  fcc('strl')

  // strh
  fcc('strh')
  u32(56)
  fcc('vids')
  fcc('MJPG')
  u32(0) // dwFlags
  u16(0) // wPriority
  u16(0) // wLanguage
  u32(0) // dwInitialFrames
  u32(1) // dwScale
  u32(fps) // dwRate => fps = dwRate/dwScale
  u32(0) // dwStart
  u32(n) // dwLength
  u32(maxFrame) // dwSuggestedBufferSize
  u32(0xffffffff) // dwQuality
  u32(0) // dwSampleSize
  u16(0)
  u16(0)
  u16(width)
  u16(height) // rcFrame

  // strf (BITMAPINFOHEADER)
  fcc('strf')
  u32(40)
  u32(40) // biSize
  u32(width)
  u32(height)
  u16(1) // biPlanes
  u16(24) // biBitCount
  fcc('MJPG') // biCompression
  u32(width * height * 3) // biSizeImage
  u32(0)
  u32(0)
  u32(0)
  u32(0)

  // LIST movi
  fcc('LIST')
  u32(moviDataLen + 4)
  const moviStart = p // points at 'movi'
  fcc('movi')

  const offsets: number[] = []
  for (let i = 0; i < n; i++) {
    offsets.push(p - moviStart) // offset of this chunk id from 'movi'
    fcc('00dc')
    u32(frames[i].length)
    buf.set(frames[i], p)
    p += frames[i].length
    if (frames[i].length & 1) buf[p++] = 0 // pad to even
  }

  // idx1
  fcc('idx1')
  u32(idxEntries * 16)
  for (let i = 0; i < n; i++) {
    fcc('00dc')
    u32(0x10) // AVIIF_KEYFRAME
    u32(offsets[i])
    u32(frames[i].length)
  }

  return buf
}
