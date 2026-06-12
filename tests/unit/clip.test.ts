import { test, expect } from 'vitest'
import {
  frameCount,
  sampleTimes,
  clampPlayhead,
  budget,
  playbackFps,
} from '../../src/lib/video/clip'

test('frameCount rounds (out-in)*fps and is at least 1', () => {
  expect(frameCount(1, 7, 10)).toBe(60)
  expect(frameCount(0, 0.04, 10)).toBe(1) // never zero for a real clip
})

test('sampleTimes spans the window at the centre of each frame interval', () => {
  const t = sampleTimes(0, 1, 4) // 4 frames over 1s
  expect(t.length).toBe(4)
  expect(t[0]).toBeCloseTo(0.125)
  expect(t[3]).toBeCloseTo(0.875)
})

test('clampPlayhead keeps the head inside the trim window', () => {
  expect(clampPlayhead(5, 1, 3)).toBe(3)
  expect(clampPlayhead(0, 1, 3)).toBe(1)
  expect(clampPlayhead(2, 1, 3)).toBe(2)
})

test('playbackFps scales the capture fps by speed (>= 1)', () => {
  expect(playbackFps(15, 1)).toBe(15)
  expect(playbackFps(15, 2)).toBe(30) // 2x plays twice as fast
  expect(playbackFps(10, 0.5)).toBe(5) // half speed
  expect(playbackFps(5, 0.5)).toBe(3) // rounds, never below 1
})

test('budget flags over/near/ok against free space', () => {
  expect(budget(100, 1000).level).toBe('ok')
  expect(budget(900, 1000).level).toBe('warn') // > 80%
  expect(budget(1200, 1000).level).toBe('over')
  expect(budget(1200, 1000).overByKB).toBe(200)
})
