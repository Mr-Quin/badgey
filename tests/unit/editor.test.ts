import { test, expect } from 'vitest'
import { clampOffset, coverCrop, STAGE, CIRCLE } from '../../src/lib/editor'

test('clampOffset has no travel at 100% (image exactly covers the stage)', () => {
  // max = STAGE/2 * 1 - CIRCLE/2 = 160 - 120 = 40
  expect(clampOffset(0, 0, 100)).toEqual({ px: 0, py: 0 })
  expect(clampOffset(100, -100, 100)).toEqual({ px: 40, py: -40 })
  expect(clampOffset(-100, 30, 100)).toEqual({ px: -40, py: 30 })
})

test('clampOffset grows the allowed travel as you zoom in', () => {
  // at 220%: max = 160 * 2.2 - 120 = 232
  expect(clampOffset(1000, 0, 220)).toEqual({ px: 232, py: 0 })
})

test('clampOffset travel shrinks toward zero as you zoom out', () => {
  // max = 160*(z/100) - 120. At z=80 → 8px of travel remains…
  expect(clampOffset(50, 50, 80)).toEqual({ px: 8, py: 8 })
  // …and at z≤75 the circle would expose edges, so travel is pinned to 0.
  expect(clampOffset(50, 50, 70)).toEqual({ px: 0, py: 0 })
})

test('coverCrop crops the long axis of a landscape source', () => {
  // 400x200 into 320x320 → scale by 320/200=1.6; sw = 320/1.6 = 200, sh = 200
  const c = coverCrop(400, 200, STAGE, STAGE)
  expect(c.sw).toBeCloseTo(200)
  expect(c.sh).toBeCloseTo(200)
  expect(c.sx).toBeCloseTo(100) // (400-200)/2
  expect(c.sy).toBeCloseTo(0)
})

test('coverCrop leaves a square source uncropped', () => {
  const c = coverCrop(500, 500, STAGE, STAGE)
  expect(c.sx).toBeCloseTo(0)
  expect(c.sy).toBeCloseTo(0)
  expect(c.sw).toBeCloseTo(500)
  expect(c.sh).toBeCloseTo(500)
})

test('exported stage constants match the design (320 stage, 240 circle)', () => {
  expect(STAGE).toBe(320)
  expect(CIRCLE).toBe(240)
})
