<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { EditorSession } from '../lib/editor-session'
  import { get } from '../lib/observable'
  import { coverCrop, STAGE, CIRCLE } from '../lib/editor'
  import {
    decodeAnimatedFrames,
    isAnimatedImageType,
    type AnimatedFrames,
  } from '../lib/video/frames'

  // The interactive editor stage: a round preview painted from the user's image,
  // a video, or decoded gif/webp frames, driven by pointer/keyboard/touch input.
  let { session }: { session: EditorSession } = $props()
  // session is a single stable instance from the parent; capturing its store once is intended.
  // svelte-ignore state_referenced_locally
  const editor = session.state

  const isVideo = $derived($editor.media === 'video')
  // A real video feeds a <video> element; animated gif/webp can't, so they use
  // decoded ImageDecoder frames instead.
  const isPlayableVideo = $derived(
    $editor.media === 'video' && !!$editor.file && $editor.file.type.startsWith('video/'),
  )
  const transform = $derived(
    `translate(${$editor.px}px, ${$editor.py}px) scale(${$editor.zoom / 100}) rotate(${$editor.rot}deg)`,
  )
  const caption = $derived(
    $editor.guides
      ? $editor.media === 'video'
        ? 'showing full frame'
        : 'showing full image'
      : '240 × 240',
  )

  let videoEl = $state<HTMLVideoElement | undefined>()
  let circleCanvas = $state<HTMLCanvasElement | undefined>()
  let ghostCanvas = $state<HTMLCanvasElement | undefined>()

  // Decoded frames for an animated gif/webp preview (kept off reactive state;
  // read inside the rAF loop). Regenerated once per file.
  let gifData: AnimatedFrames | null = null
  let gifFor: File | null = null
  function closeGif(): void {
    gifData?.bitmaps.forEach((b) => b.close())
    gifData = null
  }
  async function loadGif(f: File): Promise<void> {
    const d = await decodeAnimatedFrames(f)
    if (gifFor === f) gifData = d
    else d?.bitmaps.forEach((b) => b.close())
  }
  $effect(() => {
    const s = $editor
    const f = s.file
    const anim = !!f && isAnimatedImageType(f)
    if (s.media === 'video' && anim && f && f !== gifFor) {
      gifFor = f
      closeGif()
      void loadGif(f)
    } else if (gifFor && (s.media !== 'video' || !anim)) {
      gifFor = null
      closeGif()
    }
  })

  /** The preview frame at time `t`: a decoded gif frame, or the live video. */
  function frameSource(t: number): { src: CanvasImageSource; w: number; h: number } | null {
    if (gifData && gifData.bitmaps.length) {
      let idx = 0
      for (let i = 0; i < gifData.starts.length; i++) if (gifData.starts[i] <= t) idx = i
      return { src: gifData.bitmaps[idx], w: gifData.width, h: gifData.height }
    }
    const v = videoEl
    if (v && v.videoWidth) return { src: v, w: v.videoWidth, h: v.videoHeight }
    return null
  }

  function drawTo(canvas: HTMLCanvasElement | undefined, out: number, t: number): void {
    const fs = frameSource(t)
    if (!canvas || !fs) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = get(editor)
    ctx.clearRect(0, 0, out, out)
    if (out === CIRCLE) {
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, out, out)
    }
    ctx.save()
    ctx.translate(out / 2, out / 2)
    ctx.translate(s.px, s.py)
    ctx.scale(s.zoom / 100, s.zoom / 100)
    ctx.rotate((s.rot * Math.PI) / 180)
    const { sx, sy, sw, sh } = coverCrop(fs.w, fs.h, STAGE, STAGE)
    ctx.drawImage(fs.src, sx, sy, sw, sh, -STAGE / 2, -STAGE / 2, STAGE, STAGE)
    ctx.restore()
  }

  // One rAF loop drives playback + paints the canvases. It reads state via get()
  // so it never re-subscribes; cheap no-op when not editing a clip.
  onMount(() => {
    let raf = 0
    let last = 0
    let lastFrame = -1
    const loop = (ts: number) => {
      const s = get(editor)
      const clip = s.clip
      if (s.media === 'video' && clip) {
        const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0
        if (gifData) {
          if (clip.playing) session.advance(dt)
        } else {
          const v = videoEl
          if (v && v.readyState >= 2) {
            if (clip.playing) {
              if (v.paused) {
                v.playbackRate = clip.speed
                void v.play().catch(() => {})
              }
              if (v.playbackRate !== clip.speed) v.playbackRate = clip.speed
              if (v.currentTime >= clip.outSec || v.currentTime < clip.inSec) {
                if (clip.loop) v.currentTime = clip.inSec
                else {
                  v.pause()
                  session.pause()
                }
              }
              // Sync the playhead only on a frame step, not every rAF, to avoid a
              // store commit (and full reactive re-eval) ~60x/sec during playback.
              if (Math.floor((v.currentTime - clip.inSec) * clip.fps) !== lastFrame) {
                session.scrub(v.currentTime)
              }
            } else {
              if (!v.paused) v.pause()
              if (Math.abs(v.currentTime - clip.playhead) > 0.02) v.currentTime = clip.playhead
            }
          }
        }
        // FPS-quantized repaint: redraw only on a new frame step, so a low fps
        // visibly stutters like the badge does. Always repaint while editing
        // (guides) so drags/zooms stay live.
        const c = get(editor).clip
        if (c) {
          const frameIdx = Math.floor((c.playhead - c.inSec) * c.fps)
          if (frameIdx !== lastFrame || s.guides) {
            const qt = c.inSec + frameIdx / c.fps
            drawTo(circleCanvas, CIRCLE, qt)
            if (s.guides) drawTo(ghostCanvas, STAGE, qt)
            lastFrame = frameIdx
          }
        }
      } else {
        lastFrame = -1
      }
      last = ts
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  })

  onDestroy(closeGif)

  // ── input: pointer drag + pinch-zoom/rotate (touch) + wheel + keyboard ──
  const pointers = new Map<number, { x: number; y: number }>()
  let gesture: { dist: number; ang: number; zoom: number; rot: number } | null = null

  function activeTwo(): Array<{ x: number; y: number }> {
    return [...pointers.values()].slice(0, 2)
  }
  function startGesture(): void {
    const [a, b] = activeTwo()
    const s = get(editor)
    gesture = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      zoom: s.zoom,
      rot: s.rot,
    }
    session.beginDrag((a.x + b.x) / 2, (a.y + b.y) / 2)
  }
  function applyGesture(): void {
    if (!gesture) return
    const [a, b] = activeTwo()
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    session.setZoom(gesture.zoom * (dist / gesture.dist))
    session.setRotation(gesture.rot + ((ang - gesture.ang) * 180) / Math.PI)
    session.drag((a.x + b.x) / 2, (a.y + b.y) / 2)
  }

  function onPointerDown(e: PointerEvent) {
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      // ignore (e.g. a synthetic pointer id with no active capture)
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) session.beginDrag(e.clientX, e.clientY)
    else if (pointers.size === 2) startGesture()
  }
  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size >= 2) applyGesture()
    else session.drag(e.clientX, e.clientY)
  }
  function onPointerUp(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return
    if (pointers.size < 2) gesture = null
    if (pointers.size === 1) {
      const [p] = [...pointers.values()]
      session.beginDrag(p.x, p.y) // re-anchor single-finger drag, no jump
    } else if (pointers.size === 0) {
      session.endDrag()
    }
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    session.zoomBy(-e.deltaY * 0.12)
  }
  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 20 : 5
    let handled = true
    if (e.key === 'ArrowLeft') session.nudge(-step, 0)
    else if (e.key === 'ArrowRight') session.nudge(step, 0)
    else if (e.key === 'ArrowUp') session.nudge(0, -step)
    else if (e.key === 'ArrowDown') session.nudge(0, step)
    else if (e.key === '+' || e.key === '=') session.zoomBy(5)
    else if (e.key === '-') session.zoomBy(-5)
    else handled = false
    if (handled) e.preventDefault()
  }

  /** Capture the current preview frame as a still (used by "grab a frame"). */
  export function grab(): void {
    const fs = frameSource(get(editor).clip?.playhead ?? 0)
    if (!fs) return
    const c = document.createElement('canvas')
    c.width = fs.w
    c.height = fs.h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(fs.src, 0, 0)
    c.toBlob(
      (blob) => {
        if (blob) session.grabFrame(new File([blob], 'frame.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }
</script>

<div class="stage-wrap">
  <!-- Drag/pinch canvas: pointer + touch + keyboard driven; the Size/Rotate/Fit
       controls below provide an accessible equivalent for every action. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="stage"
    role="application"
    aria-label="Reposition, resize and rotate. Drag to move, pinch or scroll to resize, twist to rotate, or use arrow keys and +/-."
    tabindex="0"
    style="cursor: {$editor.dragging ? 'grabbing' : 'grab'}"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
    onkeydown={onKeyDown}
  >
    {#if isPlayableVideo && $editor.previewUrl}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="srcvideo" bind:this={videoEl} src={$editor.previewUrl} muted playsinline
      ></video>
    {/if}
    <!-- ghost: full frame, dimmed, revealed while editing -->
    <div class="ghost" style="opacity: {$editor.guides ? 0.34 : 0}">
      {#if isVideo}
        <canvas class="full" bind:this={ghostCanvas} width={STAGE} height={STAGE}></canvas>
      {:else if $editor.previewUrl}
        <img src={$editor.previewUrl} alt="" style="transform: {transform}" />
      {/if}
    </div>
    <!-- bright circle crop -->
    <div class="circle">
      {#if isVideo}
        <canvas
          class="full"
          data-testid="image-preview"
          bind:this={circleCanvas}
          width={CIRCLE}
          height={CIRCLE}
        ></canvas>
      {:else if $editor.previewUrl}
        <img
          data-testid="image-preview"
          src={$editor.previewUrl}
          alt="Badge preview"
          style="transform: {transform}"
        />
      {/if}
      <div class="grid" style="opacity: {$editor.guides ? 1 : 0}" aria-hidden="true">
        <span class="v1"></span><span class="v2"></span><span class="h1"></span><span class="h2"
        ></span>
        <span class="ring"></span>
      </div>
    </div>
    <div class="caption">{caption}</div>
  </div>
  <div class="hint">
    {isVideo
      ? 'Drag or pinch to frame · twist to rotate · scrub on the timeline below'
      : 'Drag to reposition · pinch, scroll or slider to resize · twist to rotate'}
  </div>
</div>

<style>
  .stage-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .stage {
    position: relative;
    width: 320px;
    height: 320px;
    max-width: 100%;
    touch-action: none;
    user-select: none;
  }
  .ghost {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 16px;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  .ghost img,
  .circle img {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 320px;
    height: 320px;
    margin: -160px 0 0 -160px;
    object-fit: cover;
    transform-origin: center;
    pointer-events: none;
  }
  /* Hidden video source feeding the preview canvases. */
  .srcvideo {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .ghost canvas.full {
    position: absolute;
    inset: 0;
    width: 320px;
    height: 320px;
    pointer-events: none;
  }
  .circle canvas.full {
    position: absolute;
    inset: 0;
    width: 240px;
    height: 240px;
    pointer-events: none;
  }
  .circle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 240px;
    height: 240px;
    margin: -120px 0 0 -120px;
    border-radius: 50%;
    overflow: hidden;
    background: #0a0a0a;
    box-shadow:
      inset 0 0 0 3px rgba(0, 0, 0, 0.4),
      0 0 0 8px var(--p-paper-alt);
  }
  .grid {
    position: absolute;
    inset: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  .grid span {
    position: absolute;
    background: rgba(255, 255, 255, 0.45);
  }
  .grid .v1 {
    left: 33.33%;
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .grid .v2 {
    left: 66.66%;
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .grid .h1 {
    top: 33.33%;
    left: 0;
    right: 0;
    height: 1px;
  }
  .grid .h2 {
    top: 66.66%;
    left: 0;
    right: 0;
    height: 1px;
  }
  .grid .ring {
    inset: 0;
    background: transparent;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55);
  }
  .caption {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 10px;
    padding: 2px 9px;
    border-radius: 999px;
    font-family: var(--p-mono);
    pointer-events: none;
    white-space: nowrap;
  }
  .hint {
    font-size: 11px;
    color: var(--p-text-muted);
    margin-top: 10px;
    text-align: center;
  }
</style>
