/** Measure a real video via a transient <video>. Animated images go through
 *  ImageDecoder in `frames.ts` instead (a <video> cannot decode a gif). */

export interface Probe {
  duration: number
  width: number
  height: number
}

/** Read duration + intrinsic size via a transient <video>. Rejects if undecodable. */
export function probeVideo(file: File): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const cleanup = () => {
      URL.revokeObjectURL(url)
      v.removeAttribute('src')
      v.load()
    }
    v.onloadedmetadata = () => {
      const out = { duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight }
      cleanup()
      if (!out.duration || !isFinite(out.duration)) reject(new Error('no duration'))
      else resolve(out)
    }
    v.onerror = () => {
      cleanup()
      reject(new Error('cannot decode video'))
    }
    v.src = url
  })
}
