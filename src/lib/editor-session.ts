/**
 * Framework-agnostic controller for the editor + send lifecycle: transform model,
 * draft autosave, size estimation, send, and restore. A view subscribes to `state`
 * and calls the methods; DOM/pointer plumbing stays in the view.
 */
import { writable, get, type Readable } from './observable'
import { clampOffset, renderBadgeJpeg, DEFAULT_TRANSFORM } from './editor'
import { persistHistory, type HistoryItem } from './stores/history'
import { upload, deviceId, error } from './stores/badge'

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
  }
}

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
    })
    if (file) {
      this.id = globalThis.crypto.randomUUID()
      this.createdAt = Date.now()
      void this.persist(false) // record the draft immediately so it survives reload
      this.schedule()
    } else {
      this.id = null
    }
  }

  /** Reopen a saved history item into the editor. */
  restore(item: HistoryItem): void {
    if (this.s.previewUrl) URL.revokeObjectURL(this.s.previewUrl)
    this.revokeSent()
    const file = new File([item.blob], item.name, { type: item.blob.type || 'image/png' })
    this.id = item.id
    this.createdAt = item.createdAt
    this.uploaded = item.uploaded
    this.badgeName = item.badgeName ?? null
    this.badgeDeviceId = item.badgeDeviceId ?? null
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
    })
    this.schedule()
  }

  /** Dismiss the success state and clear the editor. */
  finish(): void {
    this.setFile(null)
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

  // ── send ─────────────────────────────────────────────────────────
  async send(): Promise<void> {
    const file = this.s.file
    if (!file || this.s.busy) return
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
    this.estimateTimer = setTimeout(async () => {
      try {
        const bytes = await renderBadgeJpeg(file, this.transform(), this.s.quality)
        this.commit({ estimatedKB: Math.max(1, Math.round(bytes.length / 1024)) })
      } catch {
        this.commit({ estimatedKB: null })
      }
    }, ESTIMATE_MS)
    this.autosaveTimer = setTimeout(() => void this.persist(this.uploaded), AUTOSAVE_MS)
  }
  private async persist(uploaded: boolean): Promise<void> {
    const file = this.s.file
    if (!file || !this.id) return
    this.uploaded = uploaded
    await persistHistory({
      id: this.id,
      name: file.name || 'image',
      blob: file,
      transform: this.transform(),
      quality: this.s.quality,
      uploaded,
      source: this.s.source,
      badgeName: this.badgeName ?? undefined,
      badgeDeviceId: this.badgeDeviceId ?? undefined,
      createdAt: this.createdAt || Date.now(),
      updatedAt: Date.now(),
    })
  }
}
