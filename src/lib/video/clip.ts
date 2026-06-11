/** Pure clip-trimming + frame-budget math. No DOM, no framework. */

export const FPS_PRESETS = [5, 10, 15, 24] as const
export const SPEED_PRESETS = [0.5, 1, 2] as const

/** Number of frames the trimmed window yields at this fps (>= 1). */
export function frameCount(inSec: number, outSec: number, fps: number): number {
  return Math.max(1, Math.round(Math.max(0, outSec - inSec) * fps))
}

/** Mid-interval sample time for each frame across [inSec, outSec]. */
export function sampleTimes(inSec: number, outSec: number, fps: number): number[] {
  const n = frameCount(inSec, outSec, fps)
  const span = Math.max(0, outSec - inSec)
  return Array.from({ length: n }, (_, i) => inSec + ((i + 0.5) / n) * span)
}

export function clampPlayhead(t: number, inSec: number, outSec: number): number {
  return Math.max(inSec, Math.min(outSec, t))
}

/** Playback frame rate the badge plays a clip at: the capture fps scaled by speed.
 *  Same sampled frames, just declared to play faster/slower. */
export function playbackFps(fps: number, speed: number): number {
  return Math.max(1, Math.round(fps * speed))
}

type BudgetLevel = 'ok' | 'warn' | 'over'
export interface Budget {
  level: BudgetLevel
  pct: number
  overByKB: number
}

/** Estimated payload (KB) against free space (KB). */
export function budget(estKB: number, freeKB: number): Budget {
  const pct = freeKB > 0 ? (estKB / freeKB) * 100 : 100
  const level: BudgetLevel = estKB > freeKB ? 'over' : pct > 80 ? 'warn' : 'ok'
  return { level, pct: Math.min(100, pct), overByKB: Math.max(0, estKB - freeKB) }
}
