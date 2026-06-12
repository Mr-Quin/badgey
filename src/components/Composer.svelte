<script lang="ts">
  import { onDestroy } from 'svelte'
  import { progress, error, info, connection } from '../lib/stores/badge'
  import { pendingRestore } from '../lib/stores/history'
  import { EditorSession } from '../lib/editor-session'
  import { coverCrop } from '../lib/editor'
  import { openFrameSource } from '../lib/video/frames'
  import Button from './Button.svelte'
  import ClipControls from './ClipControls.svelte'
  import Preview from './Preview.svelte'

  // All editor business logic lives in the framework-agnostic controller; this
  // component is a thin view: it renders `$editor` and forwards DOM events.
  const session = new EditorSession()
  const editor = session.state
  onDestroy(() => session.destroy())
  let preview = $state<Preview | undefined>()

  // View-only derivations that combine editor state with badge stores.
  const tooBig = $derived(
    $editor.estimatedKB != null && $info != null ? $editor.estimatedKB > $info.freeKB : false,
  )
  const connected = $derived($connection === 'connected')
  const pct = $derived(
    $progress && $progress.total > 0 ? Math.round(($progress.sent / $progress.total) * 100) : 0,
  )
  const sentKB = $derived($progress ? Math.round($progress.sent / 1024) : 0)
  const totalKB = $derived($progress ? Math.round($progress.total / 1024) : 0)

  // Reopen a saved history item.
  $effect(() => {
    const item = $pendingRestore
    if (!item) return
    pendingRestore.set(null)
    void session.restore(item)
  })

  // Clipboard paste (screenshot, copied photo).
  $effect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ($editor.busy) return
      const items = Array.from(e.clipboardData?.items ?? []).filter(
        (i) => i.kind === 'file' && i.type.startsWith('image/'),
      )
      // Prefer an animation-capable representation: a clipboard often carries a
      // static png alongside the gif/webp, and the png may come first.
      const item = items.find((i) => i.type === 'image/gif' || i.type === 'image/webp') ?? items[0]
      const file = item?.getAsFile()
      if (file) {
        e.preventDefault()
        session.setFile(file, 'paste')
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  // Warn before leaving mid-transfer (BLE is slow + fragile).
  $effect(() => {
    if (!$editor.busy) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  })

  // DOM event → controller glue.
  function onInput(e: Event) {
    session.setFile((e.target as HTMLInputElement).files?.[0] ?? null)
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/')))
      session.setFile(file)
  }
  // ── media-type derivations + filmstrip thumbnails ────────────────
  const isVideo = $derived($editor.media === 'video')
  const freeKB = $derived($info ? $info.freeKB : null)
  const durLabel = $derived($editor.clip ? `${$editor.clip.duration.toFixed(1)}s` : '')

  // Filmstrip thumbnails, regenerated once per video file.
  let strip = $state<string[]>([])
  let stripFor: File | null = null
  $effect(() => {
    const s = $editor
    if (s.media === 'video' && s.file && s.file !== stripFor) {
      stripFor = s.file
      strip = []
      void buildStrip(s.file)
    } else if (s.media !== 'video' && stripFor) {
      stripFor = null
      strip = []
    }
  })

  async function buildStrip(file: File): Promise<void> {
    try {
      const src = await openFrameSource(file)
      try {
        const dur = src.duration || 1
        const N = 12
        const c = document.createElement('canvas')
        c.width = 48
        c.height = 60
        const ctx = c.getContext('2d')
        if (!ctx) return
        const urls: string[] = []
        for (let i = 0; i < N; i++) {
          const bmp = await src.frameAt(((i + 0.5) / N) * dur)
          const { sx, sy, sw, sh } = coverCrop(bmp.width, bmp.height, 48, 60)
          ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, 48, 60)
          bmp.close()
          urls.push(c.toDataURL('image/jpeg', 0.6))
        }
        if (stripFor === file) strip = urls
      } finally {
        src.close()
      }
    } catch {
      // leave the neutral track if the source can't be sampled
    }
  }
</script>

<div class="composer">
  <div class="head">
    <h3>Edit &amp; send</h3>
    {#if $editor.file}
      <span class="saved">Draft saved</span>
      {#if isVideo}
        <span class="pill video" data-testid="media-type">Video clip · {durLabel}</span>
      {:else}
        <span class="pill" data-testid="media-type">Still image</span>
      {/if}
      <label class="replace">
        Replace
        <input class="sr-only" type="file" accept="image/*,video/*" onchange={onInput} />
      </label>
    {/if}
  </div>

  {#if !$editor.file}
    <!-- empty drop zone -->
    <label class="dropzone" ondragover={(e) => e.preventDefault()} ondrop={onDrop}>
      <div class="dz-ring" aria-hidden="true">
        <svg
          class="dz-plus"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg
        >
      </div>
      <div class="dz-title">Drop an image or video clip here</div>
      <div class="dz-sub">
        click to browse, or paste from clipboard · JPG, PNG, GIF, MP4, MOV, WebM
      </div>
      <input
        class="sr-only"
        data-testid="image-input"
        type="file"
        accept="image/*,video/*"
        onchange={onInput}
      />
    </label>
  {:else}
    <!-- editor stage -->
    <Preview {session} bind:this={preview} />

    <!-- controls -->
    <div class="controls">
      {#if isVideo && $editor.clip}
        <ClipControls
          {session}
          clip={$editor.clip}
          {strip}
          estimatedKB={$editor.estimatedKB}
          {freeKB}
          onGrab={() => preview?.grab()}
        />
      {/if}
      <div class="row-label">
        <span>Size</span><span class="mono">{Math.round($editor.zoom)}%</span>
      </div>
      <div class="slider-row">
        <span class="pm">−</span>
        <input
          type="range"
          min="80"
          max="500"
          value={$editor.zoom}
          oninput={(e) => session.setZoom(+e.currentTarget.value)}
          aria-label="Size"
        />
        <span class="pm plus">+</span>
        <Button variant="ghost" size="sm" onclick={() => session.fit()}>Fit</Button>
      </div>
      <div class="row-label spaced">
        <span>Rotation</span><span class="mono">{Math.round($editor.rot)}°</span>
      </div>
      <div class="rot-row">
        <input
          type="range"
          min="-180"
          max="180"
          value={$editor.rot}
          oninput={(e) => session.setRotation(+e.currentTarget.value)}
          aria-label="Rotation"
        />
        <Button variant="ghost" size="sm" onclick={() => session.snap90()}>⟲ 90°</Button>
        <Button
          variant="ghost"
          size="sm"
          title="Reset rotation"
          aria-label="Reset rotation"
          onclick={() => session.resetRotation()}>↺</Button
        >
      </div>

      <div class="row-label spaced">
        <span>{isVideo ? 'Frame quality' : 'Quality'}</span><span class="mono"
          >{Math.round($editor.quality * 100)}%</span
        >
      </div>
      <input
        data-testid="quality-slider"
        type="range"
        min="0.5"
        max="1"
        step="0.01"
        value={$editor.quality}
        oninput={(e) => session.setQuality(+e.currentTarget.value)}
        aria-label="Quality"
        style="width: 100%"
      />
      <div class="ends">
        <span class="meta">{isVideo ? 'Smaller clip' : 'Smaller file'}</span><span class="meta"
          >Best detail</span
        >
      </div>

      <div class="estimate" class:over={tooBig} data-testid="size-estimate">
        {#if $editor.estimatedKB == null}
          <span>Estimating size…</span>
        {:else}
          <span>≈ {$editor.estimatedKB} KB</span>
        {/if}
        {#if connected && $info}<span class="free-of"> · {$info.freeKB} KB free</span>{/if}
        {#if tooBig}<span class="over-note"> · won't fit</span>{/if}
      </div>

      {#if $error && !$editor.busy && !$editor.success}
        <p class="err">{$error}</p>
      {/if}

      <div class="send-wrap send-row">
        <div class="send-grow">
          <Button
            variant="primary"
            size="lg"
            block
            data-testid="upload-button"
            onclick={() => session.send()}
            disabled={$editor.busy || tooBig || !connected}
          >
            {$editor.busy
              ? 'Sending…'
              : tooBig
                ? "Won't fit, lower the quality"
                : isVideo
                  ? 'Send clip to badge'
                  : 'Send to badge'}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="lg"
          title="Reset all edits"
          onclick={() => session.reset()}
          disabled={$editor.busy}>Reset</Button
        >
      </div>
      {#if !connected}
        <p class="gate-hint">Connect a badge to send. Your edits are saved as a draft.</p>
      {/if}
    </div>
  {/if}

  <!-- preparing (video encode) / uploading overlay -->
  {#if $editor.preparing != null}
    {@const ppct = Math.round($editor.preparing * 100)}
    <div class="overlay" data-testid="upload-progress">
      <div class="sheet">
        <div
          class="ring-prog"
          style="background: conic-gradient(var(--p-primary) {ppct * 3.6}deg, var(--p-paper-alt) 0)"
        >
          <div class="ring-hole">{ppct}%</div>
        </div>
        <div class="sheet-title">Preparing clip…</div>
        <div class="sheet-sub mono">Encoding frames</div>
        <div class="warn">
          <span>⚠</span>
          <div>Keep this tab open and the badge awake.</div>
        </div>
      </div>
    </div>
  {:else if $editor.busy && $progress}
    <div class="overlay" data-testid="upload-progress">
      <div class="sheet">
        <div
          class="ring-prog"
          style="background: conic-gradient(var(--p-primary) {pct * 3.6}deg, var(--p-paper-alt) 0)"
        >
          <div class="ring-hole">{pct}%</div>
        </div>
        <div class="sheet-title">{isVideo ? 'Sending clip…' : 'Sending to badge…'}</div>
        <div class="sheet-sub mono">{sentKB} KB / {totalKB} KB</div>
        <div class="warn">
          <span>⚠</span>
          <div>Keep this tab open and the badge awake.</div>
        </div>
      </div>
    </div>
  {/if}

  <!-- done overlay -->
  {#if $editor.success}
    <div class="overlay" data-testid="upload-success">
      <div class="sheet">
        <div class="done-badge">
          <div class="done-disc">
            {#if $editor.sentUrl}<img src={$editor.sentUrl} alt="Now showing on your badge" />{/if}
          </div>
          <div class="check">✓</div>
        </div>
        <div class="sheet-title big">
          {isVideo ? 'Your clip is on the badge!' : "It's on your badge!"}
        </div>
        <div class="sheet-sub">Saved to your badge.</div>
        <div class="send-wrap">
          <Button variant="primary" size="lg" block onclick={() => session.finish()}>Done</Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .composer {
    position: relative;
    border: 1px solid var(--p-divider);
    border-radius: 16px;
    background: var(--p-paper);
    padding: 20px 14px 22px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 9px;
    margin-bottom: 16px;
  }
  h3 {
    font-size: 16px;
    font-weight: 800;
    color: var(--p-text);
    white-space: nowrap;
  }
  .saved {
    font-size: 11px;
    font-weight: 700;
    color: var(--p-success-ink);
    background: var(--p-success-soft);
    padding: 2px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .replace {
    margin-left: auto;
    height: 28px;
    padding: 0 11px;
    display: inline-flex;
    align-items: center;
    border-radius: 8px;
    border: 1px solid var(--p-divider);
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: var(--p-text);
    white-space: nowrap;
  }
  .replace:hover {
    background: var(--p-action-hover);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    color: var(--p-text-muted);
    background: var(--p-paper-alt);
    padding: 4px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill.video {
    color: var(--p-secondary-ink);
    background: var(--p-secondary-soft);
  }

  /* drop zone */
  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 320px;
    border: 2px dashed var(--p-divider);
    border-radius: 14px;
    cursor: pointer;
    text-align: center;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .dropzone:hover {
    border-color: var(--p-primary);
    background: var(--p-action-hover);
  }
  .dz-ring {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    background: var(--p-primary-soft);
    color: var(--p-primary-ink);
    display: grid;
    place-items: center;
    margin-bottom: 6px;
  }
  .dz-plus {
    display: block;
  }
  .dz-title {
    font-size: 15px;
    font-weight: 800;
    color: var(--p-text);
  }
  .dz-sub {
    font-size: 12px;
    color: var(--p-text-muted);
  }

  /* controls span the full card width */
  .controls {
    width: 100%;
    margin: 18px auto 0;
  }
  .row-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    margin-bottom: 4px;
    color: var(--p-text);
    font-weight: 700;
  }
  .row-label.spaced {
    margin-top: 20px;
  }
  .mono {
    color: var(--p-text-muted);
    font-family: var(--p-mono);
    font-weight: 400;
  }
  .slider-row {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .slider-row input {
    flex: 1;
    height: 16px;
    cursor: pointer;
  }
  .pm {
    font-size: 15px;
    color: var(--p-text-muted);
    width: 10px;
    text-align: center;
  }
  .pm.plus {
    font-size: 17px;
  }
  .rot-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rot-row input {
    flex: 1;
    height: 16px;
    cursor: pointer;
  }
  .gate-hint {
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--p-text-muted);
    text-align: center;
    line-height: 1.4;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
  }
  .estimate {
    margin-top: 12px;
    font-size: 11.5px;
    color: var(--p-text-muted);
    font-family: var(--p-mono);
  }
  .estimate.over {
    color: var(--p-danger-ink);
    font-weight: 700;
  }
  .over-note {
    font-weight: 700;
  }
  .err {
    color: var(--p-danger-ink);
    font-size: 12px;
    margin-top: 14px;
  }
  .send-wrap {
    margin-top: 22px;
  }
  .send-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .send-grow {
    flex: 1;
  }

  /* overlays */
  .overlay {
    position: absolute;
    inset: 0;
    border-radius: 16px;
    background: rgba(18, 14, 24, 0.55);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    animation: bdg-fade 0.2s ease;
    z-index: 5;
  }
  .sheet {
    width: 290px;
    max-width: 86%;
    background: var(--p-paper);
    border-radius: 16px;
    padding: 26px 24px;
    text-align: center;
    box-shadow: 0 30px 60px -24px rgba(0, 0, 0, 0.5);
  }
  .ring-prog {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    margin: 0 auto;
    display: grid;
    place-items: center;
  }
  .ring-hole {
    width: 74px;
    height: 74px;
    border-radius: 50%;
    background: var(--p-paper);
    display: grid;
    place-items: center;
    font-size: 21px;
    font-weight: 800;
    color: var(--p-text);
  }
  .sheet-title {
    font-size: 15px;
    font-weight: 800;
    color: var(--p-text);
    margin-top: 16px;
  }
  .sheet-title.big {
    font-size: 18px;
  }
  .sheet-sub {
    font-size: 12px;
    color: var(--p-text-muted);
    margin-top: 3px;
  }
  .warn {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--p-warning-soft);
    color: var(--p-warning-ink);
    border-radius: 9px;
    padding: 9px 11px;
    margin-top: 16px;
    font-size: 11.5px;
    line-height: 1.4;
    text-align: left;
  }
  .done-badge {
    position: relative;
    width: 130px;
    height: 130px;
    margin: 0 auto;
  }
  .done-disc {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    overflow: hidden;
    background: #0a0a0a;
    box-shadow: 0 0 0 6px var(--p-success-soft);
  }
  .done-disc img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .check {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--p-success);
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 22px;
    box-shadow: 0 6px 14px -3px rgba(0, 0, 0, 0.4);
    animation: bdg-pop 0.45s ease-out;
  }
</style>
