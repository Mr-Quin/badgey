/**
 * Framework-agnostic controller for the editor + send lifecycle: transform model,
 * draft autosave, size estimation, send, and restore. A view subscribes to `state`
 * and calls the methods; DOM/pointer plumbing stays in the view.
 */
import { writable, get, type Readable } from './observable'
import { clampOffset, renderBadgeJpeg, renderBitmapJpeg, DEFAULT_TRANSFORM } from './editor'
import { persistHistory, type HistoryItem } from './stores/history'
import { getBlob } from './history'
import { upload, deviceId, error } from './stores/badge'
import { probeVideo } from './video/probe'
import { frameCount, clampPlayhead } from './video/clip'
import { encodeClip } from './video/encode'
import { openFrameSource, isAnimatedImageType, probeAnimatedImage } from './video/frames'

/** Live video-clip state (superset of the persisted `{inSec,outSec,fps}`). */
export interface ClipState {
  duration: number
  inSec: number
  outSec: number
  fps: number
  speed: number
  playhead: number
  loop: boolean
  playing: boolean
  frames: number
}

export interface EditorState {
  file: File | null
  previewUrl: string | null
  sentUrl: string | null
  px: number
  py: number
  zoom: number
  rot: number
  quality: number
  source: 'file' | 'paste'
  dragging: boolean
  /** Whether to show the rule-of-thirds grid + dimmed ghost (drag or recent change). */
  guides: boolean
  busy: boolean
  success: boolean
  /** Estimated upload size in KB, or null while (re)computing. */
  estimatedKB: number | null
  /** Still image or video clip, auto-detected from the file. */
  media: 'image' | 'video'
  /** Trim/fps/playback state when `media === 'video'`, else null. */
  clip: ClipState | null
  /** Encode progress [0,1] while preparing a clip to send, else null. */
  preparing: number | null
}

const AUTOSAVE_MS = 600
const ESTIMATE_MS = 350
const FLASH_MS = 650

function freshState(): EditorState {
  return {
    file: null,
    previewUrl: null,
    sentUrl: null,
    px: DEFAULT_TRANSFORM.px,
    py: DEFAULT_TRANSFORM.py,
    zoom: DEFAULT_TRANSFORM.zoom,
    rot: DEFAULT_TRANSFORM.rot,
    quality: 1.0,
    source: 'file',
    dragging: false,
    guides: false,
    busy: false,
    success: false,
    estimatedKB: null,
    media: 'image',
    clip: null,
    preparing: null,
  }
}

const DEFAULT_FPS = 15

function normalizeDeg(d: number): number {
  return (((d % 360) + 540) % 360) - 180
}

export class EditorSession {
  private s: EditorState = freshState()
  private store = writable<EditorState>(this.s)

  // session identity / metadata (not part of the rendered state)
  private id: string | null = null
  private createdAt = 0
  private uploaded = false
  private badgeName: string | null = null
  private badgeDeviceId: string | null = null
  /** Snapshot JPEG for video items (the badge can't be shown directly). */
  private thumbnailBlob: Blob | null = null
  /** The original file changed and needs (re)writing to storage; cleared after one write. */
  private blobDirty = false
  /** Bumped each schedule(); a stale async estimate checks it before committing. */
  private estimateSeq = 0

  private dragAnchor: { x: number; y: number; px: number; py: number } | null = null
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined
  private estimateTimer: ReturnType<typeof setTimeout> | undefined
  private flashTimer: ReturnType<typeof setTimeout> | undefined

  /** Subscribe to editor state (Svelte-store compatible: `$session.state`). */
  get state(): Readable<EditorState> {
    return { subscribe: this.store.subscribe }
  }

  private commit(patch: Partial<EditorState>): void {
    this.s = { ...this.s, ...patch }
    this.store.set(this.s)
  }

  // ── image lifecycle ──────────────────────────────────────────────
  setFile(file: File | null, source: 'file' | 'paste' = 'file'): void {
    // Cancel pending debounced work so it can't write onto the new/cleared file.
    clearTimeout(this.autosaveTimer)
    clearTimeout(this.estimateTimer)
    if (this.s.previewUrl) URL.revokeObjectURL(this.s.previewUrl)
    this.revokeSent()
    this.uploaded = false
    this.badgeName = null
    this.badgeDeviceId = null
    this.thumbnailBlob = null
    this.blobDirty = true // new original to persist (once)
    // A real video is a clip immediately. An animated image (gif/webp) starts as
    // an image and upgrades to a clip only once we confirm it has >1 frame, so a
    // static gif never flickers into clip mode.
    const video = !!file && file.type.startsWith('video/')
    const animCandidate = !!file && !video && isAnimatedImageType(file)
    this.commit({
      file,
      previewUrl: file ? URL.createObjectURL(file) : null,
      sentUrl: null,
      px: DEFAULT_TRANSFORM.px,
      py: DEFAULT_TRANSFORM.py,
      zoom: DEFAULT_TRANSFORM.zoom,
      rot: DEFAULT_TRANSFORM.rot,
      source,
      success: false,
      estimatedKB: null,
      media: video ? 'video' : 'image',
      clip: null,
      preparing: null,
    })
    if (file) {
      this.id = globalThis.crypto.randomUUID()
      this.createdAt = Date.now()
      void this.persist(false) // record the draft immediately so it survives reload
      if (video || animCandidate) {
        if (!video) this.schedule() // image estimate while we probe for animation
        void this.seedClip(file)
      } else {
        this.schedule()
      }
    } else {
      this.id = null
    }
  }

  /** Probe a clip and seed the trim window (full clip, or a restored draft's window).
   *  Handles real video (via <video>) and animated images (via ImageDecoder). */
  private async seedClip(
    file: File,
    saved?: { inSec: number; outSec: number; fps: number },
  ): Promise<void> {
    const animated = isAnimatedImageType(file)
    let duration: number
    try {
      if (animated) {
        const meta = await probeAnimatedImage(file)
        if (!meta) {
          // Static gif/webp (single frame): it's just an image, stay in image mode.
          return
        }
        duration = meta.duration || meta.frames / 10
      } else {
        duration = (await probeVideo(file)).duration
      }
    } catch {
      // Undecodable as video: fall back to a still image.
      error.set('This video format cannot be read in the browser. Try MP4, MOV, WebM, or GIF.')
      this.commit({ media: 'image', clip: null })
      this.schedule()
      return
    }
    if (this.s.file !== file) return // a newer file replaced this one mid-probe
    const inSec = saved ? Math.max(0, Math.min(saved.inSec, duration)) : 0
    const outSec = saved ? Math.max(inSec, Math.min(saved.outSec, duration)) : duration
    const fps = saved?.fps ?? DEFAULT_FPS
    this.commit({
      media: 'video',
      clip: {
        duration,
        inSec,
        outSec,
        fps,
        speed: 1,
        playhead: inSec,
        loop: true,
        playing: true, // autoplay the clip when it loads
        frames: frameCount(inSec, outSec, fps),
      },
    })
    void this.genThumb(file, inSec)
    this.schedule()
  }

  /** Render the frame at `atSec` to a snapshot JPEG, for the recent-list preview. */
  private async genThumb(file: File, atSec: number): Promise<void> {
    try {
      const src = await openFrameSource(file)
      try {
        const bmp = await src.frameAt(atSec)
        const jpeg = await renderBitmapJpeg(bmp, this.transform(), 0.7)
        bmp.close()
        if (this.s.file === file) {
          this.thumbnailBlob = new Blob([jpeg as BlobPart], { type: 'image/jpeg' })
          void this.persist(this.uploaded) // re-save the draft with its snapshot
        }
      } finally {
        src.close()
      }
    } catch {
      // no snapshot; the recent list falls back to a placeholder
    }
  }

  /** Reopen a saved history item into the editor. */
  async restore(item: HistoryItem): Promise<void> {
    // Video originals are stored separately and loaded on demand.
    const blob = item.blob ?? (await getBlob(item.id))
    if (!blob) {
      error.set('That item is no longer available to re-edit.')
      return
    }
    if (this.s.previewUrl) URL.revokeObjectURL(this.s.previewUrl)
    this.revokeSent()
    const file = new File([blob], item.name, { type: blob.type || 'image/png' })
    this.id = item.id
    this.createdAt = item.createdAt
    this.uploaded = item.uploaded
    this.badgeName = item.badgeName ?? null
    this.badgeDeviceId = item.badgeDeviceId ?? null
    this.thumbnailBlob = item.thumbnail ?? null
    // If the original came inline (not from the dedicated blob store), it still
    // needs writing there; if it was loaded via getBlob it's already stored.
    this.blobDirty = item.blob != null
    const video = item.media === 'video'
    this.commit({
      file,
      previewUrl: URL.createObjectURL(file),
      sentUrl: null,
      px: item.transform.px,
      py: item.transform.py,
      zoom: item.transform.zoom,
      rot: item.transform.rot,
      quality: item.quality,
      source: item.source ?? 'file',
      success: false,
      estimatedKB: null,
      media: video ? 'video' : 'image',
      clip: null,
      preparing: null,
    })
    if (video) void this.seedClip(file, item.clip)
    else this.schedule()
  }

  /** Dismiss the success overlay, keeping the current edit loaded for more tweaks. */
  finish(): void {
    this.commit({ success: false })
  }

  // ── pan / zoom / rotate ──────────────────────────────────────────
  beginDrag(x: number, y: number): void {
    this.dragAnchor = { x, y, px: this.s.px, py: this.s.py }
    this.commit({ dragging: true, guides: true })
  }
  drag(x: number, y: number): void {
    const a = this.dragAnchor
    if (!a) return
    const m = clampOffset(a.px + (x - a.x), a.py + (y - a.y), this.s.zoom)
    this.commit({ px: m.px, py: m.py })
    this.schedule()
  }
  endDrag(): void {
    this.dragAnchor = null
    this.commit({ dragging: false })
    this.flash()
  }
  nudge(dx: number, dy: number): void {
    const m = clampOffset(this.s.px + dx, this.s.py + dy, this.s.zoom)
    this.commit({ px: m.px, py: m.py })
    this.flash()
    this.schedule()
  }
  setZoom(zoom: number): void {
    const z = Math.max(80, Math.min(500, zoom))
    const m = clampOffset(this.s.px, this.s.py, z)
    this.commit({ zoom: z, px: m.px, py: m.py })
    this.flash()
    this.schedule()
  }
  zoomBy(delta: number): void {
    this.setZoom(this.s.zoom + delta)
  }
  setRotation(deg: number): void {
    this.commit({ rot: deg })
    this.flash()
    this.schedule()
  }
  snap90(): void {
    this.setRotation(normalizeDeg(this.s.rot + 90))
  }
  resetRotation(): void {
    this.setRotation(0)
  }
  setQuality(q: number): void {
    this.commit({ quality: q })
    this.schedule()
  }
  fit(): void {
    this.commit({ zoom: 100, px: 0, py: 0 })
    this.schedule()
  }
  reset(): void {
    this.commit({ ...DEFAULT_TRANSFORM, px: 0, py: 0 } as Partial<EditorState>)
    this.flash()
    this.schedule()
  }

  // ── video clip trim / playback ───────────────────────────────────
  private patchClip(p: Partial<ClipState>): void {
    if (!this.s.clip) return
    const c = { ...this.s.clip, ...p }
    c.frames = frameCount(c.inSec, c.outSec, c.fps)
    c.playhead = clampPlayhead(c.playhead, c.inSec, c.outSec)
    this.commit({ clip: c })
    this.schedule()
  }
  setIn(t: number): void {
    if (this.s.clip) this.patchClip({ inSec: Math.max(0, Math.min(t, this.s.clip.outSec - 0.1)) })
  }
  setOut(t: number): void {
    const c = this.s.clip
    if (c) this.patchClip({ outSec: Math.min(c.duration, Math.max(t, c.inSec + 0.1)) })
  }
  /** Slide the whole trim window to a new in-point, keeping its length. */
  slideWindow(inSec: number): void {
    const c = this.s.clip
    if (!c) return
    const span = c.outSec - c.inSec
    const ni = Math.max(0, Math.min(inSec, c.duration - span))
    this.patchClip({ inSec: ni, outSec: ni + span })
  }
  setFps(fps: number): void {
    this.patchClip({ fps })
  }
  setSpeed(speed: number): void {
    if (this.s.clip) this.commit({ clip: { ...this.s.clip, speed } })
  }
  scrub(t: number): void {
    // Playhead does not affect size, so commit without rescheduling the estimate.
    const c = this.s.clip
    if (c) this.commit({ clip: { ...c, playhead: clampPlayhead(t, c.inSec, c.outSec) } })
  }
  setLoop(loop: boolean): void {
    if (this.s.clip) this.commit({ clip: { ...this.s.clip, loop } })
  }
  play(): void {
    if (this.s.clip) this.commit({ clip: { ...this.s.clip, playing: true } })
  }
  pause(): void {
    if (this.s.clip) this.commit({ clip: { ...this.s.clip, playing: false } })
  }
  togglePlay(): void {
    if (this.s.clip?.playing) this.pause()
    else this.play()
  }

  /** Advance playback by dt seconds (driven by a rAF in the view; pure here for tests). */
  advance(dt: number): void {
    const c = this.s.clip
    if (!c || !c.playing) return
    const span = Math.max(1e-4, c.outSec - c.inSec)
    let p = c.playhead + dt * c.speed
    if (p >= c.outSec) {
      if (c.loop) {
        p = c.inSec + ((p - c.inSec) % span)
      } else {
        this.commit({ clip: { ...c, playhead: c.outSec, playing: false } })
        return
      }
    }
    this.commit({ clip: { ...c, playhead: p } })
  }

  /** Capture the current frame as a still and switch to image mode. */
  grabFrame(stillFile: File): void {
    this.pause()
    this.setFile(stillFile, this.s.source)
  }

  /** Test seam: load a clip without a real file or DOM probe. */
  _loadClipForTest(c: { duration: number; inSec: number; outSec: number; fps: number }): void {
    this.commit({
      media: 'video',
      clip: {
        ...c,
        speed: 1,
        playhead: c.inSec,
        loop: true,
        playing: false,
        frames: frameCount(c.inSec, c.outSec, c.fps),
      },
    })
  }

  // ── send ─────────────────────────────────────────────────────────
  async send(): Promise<void> {
    const file = this.s.file
    if (!file || this.s.busy) return
    if (this.s.media === 'video' && this.s.clip) {
      await this.sendClip(file, this.s.clip)
      return
    }
    this.commit({ busy: true, success: false })
    let bytes: Uint8Array
    try {
      bytes = await renderBadgeJpeg(file, this.transform(), this.s.quality)
    } catch {
      // Rendering happens client-side, so its failures don't go through the
      // badge error store — surface one here.
      error.set('Could not prepare the image. Try a different file.')
      this.commit({ busy: false })
      return
    }
    try {
      this.badgeDeviceId = get(deviceId)
      this.badgeName = await upload(bytes)
      this.revokeSent()
      this.commit({
        sentUrl: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })),
        success: true,
      })
      await this.persist(true)
    } catch {
      // upload failures surface via the badge error store
    } finally {
      this.commit({ busy: false })
    }
  }

  /** Encode the trimmed clip to MJPEG-AVI (with a "preparing" stage), then upload it. */
  private async sendClip(file: File, clip: ClipState): Promise<void> {
    this.pause()
    this.commit({ busy: true, success: false, preparing: 0 })
    let res
    try {
      res = await encodeClip(
        file,
        this.transform(),
        { inSec: clip.inSec, outSec: clip.outSec, fps: clip.fps, speed: clip.speed },
        this.s.quality,
        (p) => this.commit({ preparing: p }),
      )
    } catch {
      error.set('Could not prepare the clip. Try a shorter clip or a lower frame rate.')
      this.commit({ busy: false, preparing: null })
      return
    }
    this.commit({ preparing: null })
    // Keep the first encoded frame as the clip's snapshot (the badge can't
    // play back here, so the success screen + history show this still).
    this.thumbnailBlob = new Blob([res.thumbnail as BlobPart], { type: 'image/jpeg' })
    try {
      this.badgeDeviceId = get(deviceId)
      this.badgeName = await upload(res.bytes, { ext: 'avi' })
      this.revokeSent()
      this.commit({
        sentUrl: URL.createObjectURL(this.thumbnailBlob),
        success: true,
      })
      await this.persist(true)
    } catch {
      // upload failures surface via the badge error store
    } finally {
      this.commit({ busy: false })
    }
  }

  destroy(): void {
    clearTimeout(this.autosaveTimer)
    clearTimeout(this.estimateTimer)
    clearTimeout(this.flashTimer)
    if (this.s.previewUrl) URL.revokeObjectURL(this.s.previewUrl)
    this.revokeSent()
  }

  // ── internals ────────────────────────────────────────────────────
  private transform() {
    return { px: this.s.px, py: this.s.py, zoom: this.s.zoom, rot: this.s.rot }
  }
  private revokeSent(): void {
    if (this.s.sentUrl) URL.revokeObjectURL(this.s.sentUrl)
  }
  private flash(): void {
    this.commit({ guides: true })
    clearTimeout(this.flashTimer)
    this.flashTimer = setTimeout(() => {
      if (!this.s.dragging) this.commit({ guides: false })
    }, FLASH_MS)
  }
  /** Debounced: recompute the size estimate and persist the live draft. */
  private schedule(): void {
    clearTimeout(this.autosaveTimer)
    clearTimeout(this.estimateTimer)
    const file = this.s.file
    if (!file) {
      this.commit({ estimatedKB: null })
      return
    }
    const seq = ++this.estimateSeq
    this.estimateTimer = setTimeout(async () => {
      try {
        const clip = this.s.clip
        let kb: number
        if (this.s.media === 'video' && clip) {
          // Encode one mid-clip frame and scale by the frame count, rather than
          // encoding the whole clip on every edit.
          const src = await openFrameSource(file)
          try {
            const bmp = await src.frameAt((clip.inSec + clip.outSec) / 2)
            const one = await renderBitmapJpeg(bmp, this.transform(), this.s.quality)
            bmp.close()
            kb = Math.max(1, Math.round((one.length * clip.frames) / 1024))
          } finally {
            src.close()
          }
        } else {
          const bytes = await renderBadgeJpeg(file, this.transform(), this.s.quality)
          kb = Math.max(1, Math.round(bytes.length / 1024))
        }
        if (seq === this.estimateSeq) this.commit({ estimatedKB: kb })
      } catch {
        if (seq === this.estimateSeq) this.commit({ estimatedKB: null })
      }
    }, ESTIMATE_MS)
    this.autosaveTimer = setTimeout(() => void this.persist(this.uploaded), AUTOSAVE_MS)
  }
  private async persist(uploaded: boolean): Promise<void> {
    const file = this.s.file
    if (!file || !this.id) return
    this.uploaded = uploaded
    const clip = this.s.clip
    // Write the (possibly huge) original only when it actually changed; later
    // autosaves persist metadata only.
    const writeBlob = this.blobDirty
    this.blobDirty = false
    await persistHistory(
      {
        id: this.id,
        name: file.name || 'image',
        blob: file,
        transform: this.transform(),
        quality: this.s.quality,
        uploaded,
        source: this.s.source,
        media: this.s.media,
        clip:
          this.s.media === 'video' && clip
            ? { inSec: clip.inSec, outSec: clip.outSec, fps: clip.fps }
            : undefined,
        thumbnail: this.s.media === 'video' ? (this.thumbnailBlob ?? undefined) : undefined,
        badgeName: this.badgeName ?? undefined,
        badgeDeviceId: this.badgeDeviceId ?? undefined,
        createdAt: this.createdAt || Date.now(),
        updatedAt: Date.now(),
      },
      writeBlob,
    )
  }
}
