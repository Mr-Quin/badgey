/**
 * Crop-editor geometry. The image is laid out "cover" in a {@link STAGE}px square,
 * transformed by translate→scale→rotate; a centred {@link CIRCLE}px circle shows the
 * crop. The same transform is replayed onto a {@link OUT}px canvas (CIRCLE === OUT,
 * so offsets need no conversion) to produce the uploaded pixels.
 */
export const STAGE = 320
export const CIRCLE = 240
/** Badge output size in px (square); the uploaded JPEG / each video frame. */
export const OUT = 240

export interface Transform {
  px: number
  py: number
  /** Zoom as a percentage; 100 = image exactly covers the stage. */
  zoom: number
  /** Rotation in degrees. */
  rot: number
}

export const DEFAULT_TRANSFORM: Transform = { px: 0, py: 0, zoom: 115, rot: 0 }

/**
 * Clamp the pan offset so the bright circle never slides off the image (which
 * would reveal black gaps). At zoom z the cover image's half-extent along its
 * limiting axis is `1.6 * z` px (160 * z/100); the circle's half-extent is
 * CIRCLE/2. The allowed travel is the difference.
 */
export function clampOffset(px: number, py: number, zoom: number): { px: number; py: number } {
  const max = Math.max(0, (STAGE / 2) * (zoom / 100) - CIRCLE / 2)
  const clamp = (v: number) => Math.max(-max, Math.min(max, v))
  return { px: clamp(px), py: clamp(py) }
}

/**
 * Centred "cover" crop: the source rectangle of `srcW`×`srcH` to draw so it
 * fills `dstW`×`dstH` without distortion (the overflow on the longer axis is
 * cropped equally from both sides).
 */
export function coverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const sw = dstW / scale
  const sh = dstH / scale
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh }
}

/**
 * Render the framed image to a 240×240 JPEG, replaying the editor transform.
 * The badge applies its own circular mask, so we render the full square (black
 * background behind any uncovered corners) and let the device crop the circle.
 * Requires a browser (OffscreenCanvas / createImageBitmap).
 */
export async function renderBadgeJpeg(
  src: ImageBitmapSource,
  t: Transform,
  quality: number,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(src)
  try {
    return await renderBitmapJpeg(bitmap, t, quality)
  } finally {
    bitmap.close()
  }
}

/** Replay the editor transform of a bitmap onto a 240×240 2D context (black bg). */
function drawTransformed(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  t: Transform,
): void {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, OUT, OUT)
  ctx.save()
  ctx.translate(OUT / 2, OUT / 2)
  ctx.translate(t.px, t.py)
  ctx.scale(t.zoom / 100, t.zoom / 100)
  ctx.rotate((t.rot * Math.PI) / 180)
  const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height, STAGE, STAGE)
  ctx.drawImage(bitmap, sx, sy, sw, sh, -STAGE / 2, -STAGE / 2, STAGE, STAGE)
  ctx.restore()
}

/** Render an already-decoded bitmap (e.g. one video frame) to a 240×240 JPEG. */
export async function renderBitmapJpeg(
  bitmap: ImageBitmap,
  t: Transform,
  quality: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(OUT, OUT)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  drawTransformed(ctx, bitmap, t)
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Uint8Array(await blob.arrayBuffer())
}
