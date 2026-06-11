<script lang="ts">
  import type { EditorSession, ClipState } from '../lib/editor-session'

  // Thin view over the session's clip state: a filmstrip with draggable in/out
  // handles, a window-slide grip, and a scrub tab below the strip.
  let { session, clip, strip }: { session: EditorSession; clip: ClipState; strip: string[] } =
    $props()

  const dur = $derived(Math.max(0.001, clip.duration))
  const inPct = $derived((clip.inSec / dur) * 100)
  const outPct = $derived((clip.outSec / dur) * 100)
  const spanPct = $derived(((clip.outSec - clip.inSec) / dur) * 100)
  const playPct = $derived((clip.playhead / dur) * 100)

  let stripEl = $state<HTMLDivElement>()
  let mode: 'in' | 'out' | 'window' | 'scrub' | null = null
  let winGrab = 0

  function timeAt(clientX: number): number {
    if (!stripEl) return 0
    const r = stripEl.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return frac * dur
  }

  function apply(clientX: number) {
    const t = timeAt(clientX)
    if (mode === 'in') session.setIn(t)
    else if (mode === 'out') session.setOut(t)
    else if (mode === 'window') session.slideWindow(t - winGrab)
    else if (mode === 'scrub') session.scrub(t)
  }

  function onWinMove(e: PointerEvent) {
    if (mode) apply(e.clientX)
  }
  function onWinUp() {
    mode = null
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
  }
  function begin(m: typeof mode, e: PointerEvent, seed = true) {
    e.stopPropagation()
    mode = m
    window.addEventListener('pointermove', onWinMove)
    window.addEventListener('pointerup', onWinUp)
    if (seed) apply(e.clientX)
  }
  function beginWindow(e: PointerEvent) {
    winGrab = timeAt(e.clientX) - clip.inSec
    begin('window', e, false)
  }
</script>

<div class="timeline">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="strip"
    bind:this={stripEl}
    data-testid="video-timeline"
    onpointerdown={(e) => begin('scrub', e)}
  >
    <div class="frames" aria-hidden="true">
      {#each strip.length ? strip : Array(12).fill('') as url}
        <div class="frame" style={url ? `background-image:url(${url})` : ''}></div>
      {/each}
    </div>
    <div class="mask" style="width:{inPct}%"></div>
    <div class="mask right" style="left:{outPct}%"></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="window"
      style="left:{inPct}%;width:{spanPct}%"
      title="Drag to slide the whole clip window"
      onpointerdown={beginWindow}
    >
      <div class="grip" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="handle in"
      style="left:{inPct}%"
      title="Trim start"
      onpointerdown={(e) => begin('in', e, false)}
    >
      <span></span>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="handle out"
      style="left:{outPct}%"
      title="Trim end"
      onpointerdown={(e) => begin('out', e, false)}
    >
      <span></span>
    </div>
    <div class="playline" style="left:{playPct}%"></div>
  </div>
  <div class="scrubrow">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scrubtab"
      style="left:{playPct}%"
      title="Drag to set the playback position"
      onpointerdown={(e) => begin('scrub', e, false)}
    >
      <div class="tri"></div>
      <div class="knob"><span></span><span></span></div>
    </div>
  </div>
</div>

<style>
  .timeline {
    margin-bottom: 4px;
  }
  .strip {
    position: relative;
    height: 60px;
    border-radius: 10px;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    cursor: pointer;
    background: #0a0a0a;
  }
  .frames {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 1px;
    pointer-events: none;
  }
  .frame {
    flex: 1;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-color: #161318;
  }
  .mask {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: rgba(8, 6, 12, 0.62);
    pointer-events: none;
  }
  .mask.right {
    left: auto;
    right: 0;
    width: auto;
  }
  .mask:not(.right) {
    right: auto;
  }
  .window {
    position: absolute;
    top: 0;
    bottom: 0;
    box-shadow: inset 0 0 0 2px var(--p-primary);
    border-radius: 4px;
    cursor: grab;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .grip {
    display: flex;
    gap: 2.5px;
    pointer-events: none;
    padding: 4px 7px;
    border-radius: 6px;
    background: rgba(20, 16, 26, 0.42);
  }
  .grip span {
    width: 2px;
    height: 13px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 2px;
  }
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 14px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--p-primary);
    touch-action: none;
  }
  .handle.in {
    margin-left: -14px;
    border-radius: 4px 0 0 4px;
  }
  .handle.out {
    border-radius: 0 4px 4px 0;
  }
  .handle span {
    width: 2px;
    height: 18px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 2px;
  }
  .playline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }
  .scrubrow {
    position: relative;
    height: 18px;
    margin-top: 3px;
  }
  .scrubtab {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    cursor: ew-resize;
    touch-action: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 4px;
  }
  .tri {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid var(--p-text);
  }
  .knob {
    display: flex;
    gap: 2px;
    align-items: center;
    height: 15px;
    padding: 0 7px;
    border-radius: 5px;
    background: var(--p-text);
    box-shadow: 0 3px 7px -3px rgba(0, 0, 0, 0.55);
    margin-top: -1px;
  }
  .knob span {
    width: 1.5px;
    height: 8px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 2px;
  }
</style>
