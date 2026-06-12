import { test, expect } from 'vitest'
import { isAnimatedImageType } from '../../src/lib/video/frames'

const file = (name: string, type: string) => new File([new Uint8Array([0])], name, { type })

test('isAnimatedImageType flags gif and webp', () => {
  expect(isAnimatedImageType(file('loop.gif', 'image/gif'))).toBe(true)
  expect(isAnimatedImageType(file('loop.webp', 'image/webp'))).toBe(true)
})

test('isAnimatedImageType rejects stills and videos', () => {
  expect(isAnimatedImageType(file('a.png', 'image/png'))).toBe(false)
  expect(isAnimatedImageType(file('a.jpg', 'image/jpeg'))).toBe(false)
  // Real videos are handled by their own path, not as animated images.
  expect(isAnimatedImageType(file('a.mp4', 'video/mp4'))).toBe(false)
})

test('isAnimatedImageType falls back to extension when type is empty', () => {
  expect(isAnimatedImageType(file('clip.gif', ''))).toBe(true)
  expect(isAnimatedImageType(file('clip.webp', ''))).toBe(true)
  expect(isAnimatedImageType(file('photo.jpg', ''))).toBe(false)
})
