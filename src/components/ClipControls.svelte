<script lang="ts">
  import type { EditorSession, ClipState } from '../lib/editor-session'
  import { FPS_PRESETS, SPEED_PRESETS, budget } from '../lib/video/clip'
  import VideoTimeline from './VideoTimeline.svelte'

  let {
    session,
    clip,
    strip,
    estimatedKB,
    freeKB,
    onGrab,
  }: {
    session: EditorSession
    clip: ClipState
    strip: string[]
    estimatedKB: number | null
    freeKB: number | null
    onGrab: () => void
  } = $props()

  const fmt = (t: number) => `${t.toFixed(1)}s`
  const span = $derived(Math.max(0, clip.outSec - clip.inSec))
  const cur = $derived(Math.max(0, clip.playhead - clip.inSec))

  // Continuous sliders that snap the dragged value to the nearest preset stop.
  const FPS_MIN = FPS_PRESETS[0]
  const FPS_MAX = FPS_PRESETS[FPS_PRESETS.length - 1]
  const SPEED_MIN = SPEED_PRESETS[0]
  const SPEED_MAX = SPEED_PRESETS[SPEED_PRESETS.length - 1]
  const snap = (stops: readonly number[], v: number): number =>
    stops.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
  const pct = (v: number, min: number, max: number) => ((v - min) / (max - min)) * 100

  const b = $derived(estimatedKB != null && freeKB != null ? budget(estimatedKB, freeKB) : null)
  const budgetColor = $derived(
    b?.level === 'over'
      ? 'var(--p-danger)'
      : b?.level === 'warn'
        ? 'var(--p-warning)'
        : 'var(--p-success)',
  )
  const budgetInk = $derived(
    b?.level === 'over'
      ? 'var(--p-danger-ink)'
      : b?.level === 'warn'
        ? 'var(--p-warning-ink)'
        : 'var(--p-text-muted)',
  )
  const budgetMsg = $derived(
    b == null
      ? 'Estimating clip size…'
      : b.level === 'over'
        ? `Over by ${b.overByKB} KB. Trim the clip or lower the frame rate.`
        : b.level === 'warn'
          ? 'Close to the limit. Sends fine, but little room to spare.'
          : `${clip.frames} frames fit in the free space.`,
  )
</script>

<div class="clip">
  <div class="head">
    <div class="title">
      <span class="t">Clip</span>
      <span class="mono">{fmt(cur)} / {fmt(span)}</span>
    </div>
    <span class="hint">drag tab to scrub · bar to move</span>
  </div>

  <!-- playback bar -->
  <div class="bar">
    <button
      class="play"
      data-testid="play-toggle"
      title={clip.playing ? 'Pause' : 'Play'}
      aria-label={clip.playing ? 'Pause' : 'Play'}
      onclick={() => session.togglePlay()}
    >
      {#if clip.playing}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"
          ><rect x="6" y="5" width="4" height="14" rx="1" /><rect
            x="14"
            y="5"
            width="4"
            height="14"
            rx="1"
          /></svg
        >
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-left:2px"
          ><path d="M8 5v14l11-7z" /></svg
        >
      {/if}
    </button>
    <button
      class="loop"
      class:on={clip.loop}
      title="Loop the clip on the badge"
      onclick={() => session.setLoop(!clip.loop)}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path
          d="M7 22l-4-4 4-4"
        /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg
      >Loop
    </button>
  </div>

  <VideoTimeline {session} {clip} {strip} />

  <!-- in / span / out -->
  <div class="readouts">
    <div class="ro left">
      <div class="cap">In</div>
      <div class="mono v">{fmt(clip.inSec)}</div>
    </div>
    <div class="pill">{fmt(span)} · {clip.frames} frames</div>
    <div class="ro right">
      <div class="cap">Out</div>
      <div class="mono v">{fmt(clip.outSec)}</div>
    </div>
  </div>

  <!-- frame rate: continuous, snaps to the preset stops -->
  <div class="rowhead">
    <span>Frame rate</span><span class="mono">{clip.fps} fps</span>
  </div>
  <input
    class="snap"
    data-testid="fps-chip"
    type="range"
    min={FPS_MIN}
    max={FPS_MAX}
    step="1"
    value={clip.fps}
    oninput={(e) => session.setFps(snap(FPS_PRESETS, +e.currentTarget.value))}
    aria-label="Frame rate"
  />
  <div class="ticks">
    {#each FPS_PRESETS as n}
      <span style="left:{pct(n, FPS_MIN, FPS_MAX)}%" class:on={clip.fps === n}>{n}</span>
    {/each}
  </div>

  <!-- speed: continuous, snaps to the preset stops; changes the badge playback rate -->
  <div class="rowhead">
    <span>Speed</span><span class="mono">{clip.speed}×</span>
  </div>
  <input
    class="snap"
    type="range"
    min={SPEED_MIN}
    max={SPEED_MAX}
    step="0.05"
    value={clip.speed}
    oninput={(e) => session.setSpeed(snap(SPEED_PRESETS, +e.currentTarget.value))}
    aria-label="Speed"
  />
  <div class="ticks">
    {#each SPEED_PRESETS as sp}
      <span style="left:{pct(sp, SPEED_MIN, SPEED_MAX)}%" class:on={clip.speed === sp}>{sp}×</span>
    {/each}
  </div>

  <!-- frame budget -->
  <div class="budget" data-testid="frame-budget">
    <div class="rowhead">
      <span>Frame budget</span>
      <span class="mono" style="color:{budgetInk};font-weight:700">
        {estimatedKB != null ? `${estimatedKB} KB` : '…'}{freeKB != null
          ? ` / ${freeKB} KB free`
          : ''}
      </span>
    </div>
    <div class="track">
      <div class="fill" style="width:{Math.min(100, b?.pct ?? 0)}%;background:{budgetColor}"></div>
    </div>
    <div class="msg" style="color:{budgetInk}">
      <span class="dot" style="background:{budgetColor}"></span>{budgetMsg}
    </div>
  </div>

  <button class="grab" onclick={onGrab}>
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      ><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.4" /><path
        d="M8 6l1.5-2.2h5L16 6"
      /></svg
    >
    Grab this frame as a still
  </button>
</div>

<style>
  .clip {
    border: 1px solid var(--p-divider);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 20px;
    background: var(--p-bg);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .title .t {
    font-size: 13px;
    font-weight: 800;
    color: var(--p-text);
  }
  .mono {
    font-family: var(--p-mono);
  }
  .head .mono {
    font-size: 11px;
    color: var(--p-text-muted);
  }
  .hint {
    font-size: 10.5px;
    color: var(--p-text-muted);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .play {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 0;
    cursor: pointer;
    background: var(--p-primary);
    color: var(--p-on-primary);
    display: grid;
    place-items: center;
    box-shadow: 0 8px 18px -8px var(--p-action-focus);
  }
  .loop {
    height: 30px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    border: 1px solid var(--p-divider);
    background: transparent;
    color: var(--p-text-muted);
  }
  .loop.on {
    border-color: transparent;
    background: var(--p-primary-soft);
    color: var(--p-primary-ink);
  }
  .snap {
    width: 100%;
    height: 16px;
    cursor: pointer;
  }
  .ticks {
    position: relative;
    height: 13px;
    margin-top: 3px;
  }
  .ticks span {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--p-text-muted);
    white-space: nowrap;
  }
  .ticks span.on {
    color: var(--p-primary-ink);
    font-weight: 800;
  }
  .readouts {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
  }
  .ro.right {
    text-align: right;
  }
  .cap {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--p-text-muted);
  }
  .ro .v {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--p-text);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 11px;
    border-radius: 999px;
    background: var(--p-primary-soft);
    color: var(--p-primary-ink);
    font-size: 11.5px;
    font-weight: 800;
  }
  .rowhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 16px 0 7px;
    font-size: 12px;
    font-weight: 700;
    color: var(--p-text);
  }
  .rowhead .mono {
    font-size: 11px;
    font-weight: 400;
    color: var(--p-text-muted);
  }
  .budget {
    margin-top: 16px;
  }
  .track {
    position: relative;
    height: 8px;
    border-radius: 999px;
    background: var(--p-paper-alt);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
    font-size: 11px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
  }
  .grab {
    width: 100%;
    height: 36px;
    margin-top: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 9px;
    cursor: pointer;
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--p-text);
    background: transparent;
    border: 1px solid var(--p-divider);
  }
</style>
