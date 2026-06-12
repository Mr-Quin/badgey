import type { Transform } from '../editor'
import { renderBitmapJpeg, OUT } from '../editor'
import { sampleTimes, playbackFps } from './clip'
import { muxMjpegAvi } from './avi'
import { openFrameSource } from './frames'

export interface ClipParams {
  inSec: number
  outSec: number
  fps: number
  /** Playback speed multiplier (e.g. 2 = plays twice as fast on the badge). */
  speed?: number
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
    // Frames are sampled at the capture fps; speed only changes the playback
    // rate the badge plays them back at (same frames, faster/slower).
    const playFps = playbackFps(clip.fps, clip.speed ?? 1)
    const bytes = muxMjpegAvi(jpegs, { width: OUT, height: OUT, fps: playFps })
    return { bytes, frames: jpegs.length, thumbnail: jpegs[0] }
  } finally {
    src.close()
  }
}
