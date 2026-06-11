/**
 * Extract decoded frames at sample times. <video> seek for real video;
 * ImageDecoder for animated gif/webp. Browser-only (no framework imports).
 */

export interface FrameSource {
  /** Decode the frame nearest `t` seconds. Caller must close() the returned bitmap. */
  frameAt(t: number): Promise<ImageBitmap>
  duration: number
  close(): void
}

export async function openFrameSource(file: File): Promise<FrameSource> {
  if (file.type === 'image/gif' || /\.(gif|webp)$/i.test(file.name) || file.type === 'image/webp') {
    const viaDecoder = await tryImageDecoder(file)
    if (viaDecoder) return viaDecoder
  }
  return openVideoSeeker(file)
}

function openVideoSeeker(file: File): Promise<FrameSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true
    v.onloadeddata = () => {
      resolve({
        duration: v.duration || 0,
        frameAt(t: number): Promise<ImageBitmap> {
          return new Promise((res) => {
            v.onseeked = () => res(createImageBitmap(v))
            v.currentTime = Math.max(0, Math.min((v.duration || 0) - 1e-3, t))
          })
        },
        close() {
          URL.revokeObjectURL(url)
          v.removeAttribute('src')
          v.load()
        },
      })
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('cannot decode video'))
    }
    v.src = url
  })
}

// --- ImageDecoder (WebCodecs) typed locally; not in the DOM lib. ---
interface VideoFrameLike {
  duration: number | null
  close(): void
}
interface ImageDecoderLike {
  completed: Promise<void>
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
  decode(opts: { frameIndex: number }): Promise<{ image: VideoFrameLike }>
  close(): void
}
interface ImageDecoderCtor {
  new (init: { data: ArrayBuffer | ArrayBufferView; type: string }): ImageDecoderLike
}

async function tryImageDecoder(file: File): Promise<FrameSource | null> {
  const Ctor = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder
  if (!Ctor) return null
  const dec = new Ctor({ data: await file.arrayBuffer(), type: file.type || 'image/gif' })
  await dec.completed
  await dec.tracks.ready // selectedTrack/frameCount are only populated once ready
  const count = dec.tracks.selectedTrack?.frameCount ?? 1

  // Pre-read per-frame durations (microseconds) to map time -> frame index.
  const starts: number[] = []
  let durUs = 0
  for (let i = 0; i < count; i++) {
    starts.push(durUs)
    const { image } = await dec.decode({ frameIndex: i })
    durUs += image.duration ?? 100000
    image.close()
  }

  return {
    duration: durUs / 1e6,
    async frameAt(t: number): Promise<ImageBitmap> {
      const tUs = t * 1e6
      let idx = 0
      for (let i = 0; i < starts.length; i++) if (starts[i] <= tUs) idx = i
      const { image } = await dec.decode({ frameIndex: idx })
      const bmp = await createImageBitmap(image as unknown as ImageBitmapSource)
      image.close()
      return bmp
    },
    close() {
      dec.close()
    },
  }
}

/** Animated images (gif/webp) are clip candidates; statics are not. */
export function isAnimatedImageType(file: File): boolean {
  return (
    file.type === 'image/gif' ||
    file.type === 'image/webp' ||
    (!file.type && /\.(gif|webp)$/i.test(file.name))
  )
}

export interface AnimatedFrames {
  bitmaps: ImageBitmap[]
  /** Start time of each frame, in seconds. */
  starts: number[]
  duration: number
  width: number
  height: number
}

/** Decode every frame of an animated image to bitmaps. Returns null if it can't
 *  be decoded or has a single frame (i.e. a still image). Caller closes bitmaps. */
export async function decodeAnimatedFrames(file: File): Promise<AnimatedFrames | null> {
  const Ctor = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder
  if (!Ctor) return null
  let dec: ImageDecoderLike
  try {
    dec = new Ctor({ data: await file.arrayBuffer(), type: file.type || 'image/gif' })
    await dec.completed
    await dec.tracks.ready // selectedTrack/frameCount are only populated once ready
  } catch {
    return null
  }
  const count = dec.tracks.selectedTrack?.frameCount ?? 1
  if (count <= 1) {
    dec.close()
    return null
  }
  const bitmaps: ImageBitmap[] = []
  const starts: number[] = []
  let durUs = 0
  try {
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i })
      starts.push(durUs / 1e6)
      durUs += image.duration ?? 100000
      bitmaps.push(await createImageBitmap(image as unknown as ImageBitmapSource))
      image.close()
    }
  } finally {
    dec.close()
  }
  if (!bitmaps.length) return null
  return {
    bitmaps,
    starts,
    duration: durUs / 1e6,
    width: bitmaps[0].width,
    height: bitmaps[0].height,
  }
}

/** Lightweight metadata probe for an animated image: duration + frame count. */
export async function probeAnimatedImage(
  file: File,
): Promise<{ duration: number; frames: number } | null> {
  const a = await decodeAnimatedFrames(file)
  if (!a) return null
  const meta = { duration: a.duration, frames: a.bitmaps.length }
  a.bitmaps.forEach((b) => b.close())
  return meta
}
