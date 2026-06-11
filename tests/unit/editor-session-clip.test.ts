import { test, expect } from 'vitest'
import { EditorSession } from '../../src/lib/editor-session'
import { get } from '../../src/lib/observable'

test('advance moves the playhead and loops within the trim window', () => {
  const s = new EditorSession()
  s._loadClipForTest({ duration: 10, inSec: 2, outSec: 4, fps: 10 })
  s.setLoop(true)
  s.play()
  s.advance(1.5) // 2 -> 3.5
  expect(get(s.state).clip?.playhead).toBeCloseTo(3.5)
  s.advance(1.0) // would be 4.5; loops back into [2,4]
  const ph = get(s.state).clip!.playhead
  expect(ph).toBeGreaterThanOrEqual(2)
  expect(ph).toBeLessThanOrEqual(4)
  s.destroy()
})

test('advance without loop stops at the out point', () => {
  const s = new EditorSession()
  s._loadClipForTest({ duration: 10, inSec: 0, outSec: 2, fps: 10 })
  s.setLoop(false)
  s.play()
  s.advance(5)
  expect(get(s.state).clip?.playhead).toBeCloseTo(2)
  expect(get(s.state).clip?.playing).toBe(false)
  s.destroy()
})

test('setFps clamps and recomputes the frame count', () => {
  const s = new EditorSession()
  s._loadClipForTest({ duration: 10, inSec: 0, outSec: 6, fps: 10 })
  s.setFps(15)
  expect(get(s.state).clip?.fps).toBe(15)
  expect(get(s.state).clip?.frames).toBe(90) // 6s * 15
  s.destroy()
})

test('trim handles keep in < out and clamp the playhead', () => {
  const s = new EditorSession()
  s._loadClipForTest({ duration: 10, inSec: 0, outSec: 10, fps: 10 })
  s.scrub(8)
  s.setOut(5) // playhead (8) must clamp back to 5
  expect(get(s.state).clip?.outSec).toBe(5)
  expect(get(s.state).clip?.playhead).toBe(5)
  s.destroy()
})
