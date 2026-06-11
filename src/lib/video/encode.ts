import type { Transform } from '../editor'
import { renderBitmapJpeg } from '../editor'
import { sampleTimes } from './clip'
import { muxMjpegAvi } from './avi'
import { openFrameSource } from './frames'
import { OUT_DIM } from './dims'

export interface ClipParams {
  inSec: number
  outSec: number
  fps: number
}

export interface EncodeResult {
  bytes: Uint8Array
  frames: number
  /** First rendered frame as a JPEG, for a thumbnail. */
  thumbnail: Uint8Array
}

/** Encode the trimmed, framed clip to an MJPEG-AVI. `onProgress` in [0,1]. */
export async function encodeClip(
  file: File,
  transform: Transform,
  clip: ClipParams,
  quality: number,
  onProgress?: (p: number) => void,
): Promise<EncodeResult> {
  const src = await openFrameSource(file)
  try {
    const times = sampleTimes(clip.inSec, clip.outSec, clip.fps)
    const jpegs: Uint8Array[] = []
    for (let i = 0; i < times.length; i++) {
      const bmp = await src.frameAt(times[i])
      try {
        jpegs.push(await renderBitmapJpeg(bmp, transform, quality))
      } finally {
        bmp.close()
      }
      onProgress?.((i + 1) / times.length)
    }
    const bytes = muxMjpegAvi(jpegs, { width: OUT_DIM, height: OUT_DIM, fps: clip.fps })
    return { bytes, frames: jpegs.length, thumbnail: jpegs[0] }
  } finally {
    src.close()
  }
}
