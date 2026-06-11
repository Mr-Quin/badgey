<script lang="ts">
  import { onDestroy } from 'svelte'
  import { progress, error, info, connection } from '../lib/stores/badge'
  import { pendingRestore } from '../lib/stores/history'
  import { EditorSession } from '../lib/editor-session'
  import Button from './Button.svelte'

  // All editor business logic lives in the framework-agnostic controller; this
  // component is a thin view: it renders `$editor` and forwards DOM events.
  const session = new EditorSession()
  const editor = session.state
  onDestroy(() => session.destroy())

  // View-only derivations that combine editor state with badge stores.
  const tooBig = $derived(
    $editor.estimatedKB != null && $info != null ? $editor.estimatedKB > $info.freeKB : false,
  )
  const connected = $derived($connection === 'connected')
  const transform = $derived(
    `translate(${$editor.px}px, ${$editor.py}px) scale(${$editor.zoom / 100}) rotate(${$editor.rot}deg)`,
  )
  const caption = $derived($editor.guides ? 'showing full image' : '240 × 240')
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
    session.restore(item)
  })

  // Clipboard paste (screenshot, copied photo).
  $effect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ($editor.busy) return
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (i) => i.kind === 'file' && i.type.startsWith('image/'),
      )
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
    if (file && file.type.startsWith('image/')) session.setFile(file)
  }
  function onPointerDown(e: PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    session.beginDrag(e.clientX, e.clientY)
  }
  function onPointerMove(e: PointerEvent) {
    session.drag(e.clientX, e.clientY)
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
</script>

<div class="composer">
  <div class="head">
    <h3>Edit &amp; send</h3>
    {#if $editor.file}
      <span class="saved">Draft saved</span>
      <label class="replace">
        Replace
        <input class="sr-only" type="file" accept="image/*" onchange={onInput} />
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
      <div class="dz-title">Drop an image here</div>
      <div class="dz-sub">click to browse, or paste from clipboard · JPG, PNG, GIF</div>
      <input
        class="sr-only"
        data-testid="image-input"
        type="file"
        accept="image/*"
        onchange={onInput}
      />
    </label>
  {:else}
    <!-- editor stage -->
    <div class="stage-wrap">
      <!-- Drag canvas: pointer + keyboard driven; the Size/Rotate/Fit/Reset
           controls below provide an accessible equivalent for every action. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="stage"
        role="application"
        aria-label="Reposition and resize image. Drag, or use arrow keys to move and +/- to zoom."
        tabindex="0"
        style="cursor: {$editor.dragging ? 'grabbing' : 'grab'}"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={() => session.endDrag()}
        onwheel={onWheel}
        onkeydown={onKeyDown}
      >
        <!-- ghost: full image, dimmed, revealed while editing -->
        <div class="ghost" style="opacity: {$editor.guides ? 0.34 : 0}">
          {#if $editor.previewUrl}<img
              src={$editor.previewUrl}
              alt=""
              style="transform: {transform}"
            />{/if}
        </div>
        <!-- bright circle crop -->
        <div class="circle">
          {#if $editor.previewUrl}
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
      <div class="hint">Drag to reposition · scroll or slider to resize</div>
    </div>

    <!-- controls -->
    <div class="controls">
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

      <div class="btns spaced-top">
        <Button variant="ghost" block onclick={() => session.fit()}>Fit</Button>
        <Button variant="ghost" block onclick={() => session.reset()}>Reset all</Button>
      </div>

      <div class="row-label spaced">
        <span>Quality</span><span class="mono">{Math.round($editor.quality * 100)}%</span>
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
        <span class="meta">Smaller file</span><span class="meta">Best detail</span>
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

      <div class="send-wrap">
        <Button
          variant="primary"
          size="lg"
          block
          data-testid="upload-button"
          onclick={() => session.send()}
          disabled={$editor.busy || tooBig || !connected}
        >
          {$editor.busy ? 'Sending…' : tooBig ? "Won't fit, lower the quality" : 'Send to badge'}
        </Button>
      </div>
      {#if !connected}
        <p class="gate-hint">Connect a badge to send. Your edits are saved as a draft.</p>
      {/if}
    </div>
  {/if}

  <!-- uploading overlay -->
  {#if $editor.busy && $progress}
    <div class="overlay" data-testid="upload-progress">
      <div class="sheet">
        <div
          class="ring-prog"
          style="background: conic-gradient(var(--p-primary) {pct * 3.6}deg, var(--p-paper-alt) 0)"
        >
          <div class="ring-hole">{pct}%</div>
        </div>
        <div class="sheet-title">Sending to badge…</div>
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
        <div class="sheet-title big">It's on your badge!</div>
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
    padding: 22px 24px 24px;
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

  /* editor stage */
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

  /* controls */
  .controls {
    max-width: 380px;
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
  .btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 14px;
  }
  .btns.spaced-top {
    margin-top: 8px;
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
