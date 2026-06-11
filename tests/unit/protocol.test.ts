import { test, expect } from 'vitest'
import { BadgeClient } from '../../src/lib/badge/protocol'
import { FakeBadge } from '../../src/lib/badge/fake-badge'

test('end-to-end protocol against FakeBadge', async () => {
  const fb = new FakeBadge()
  const client = new BadgeClient(fb, { authSettleMs: 0, browseQuiesceMs: 5 })

  await client.connect()

  const files = await client.listFiles()
  expect(files.some((f) => f.name === 'f_1.jpg')).toBe(true)

  const info = await client.getInfo()
  expect(info.freeKB).toBeGreaterThan(0)
  expect(info.picture).toEqual([240, 240])

  const progress: Array<[number, number]> = []
  await client.uploadImage(new Uint8Array(5000).fill(1), {
    onProgress: (sent, total) => progress.push([sent, total]),
  })
  expect(progress.length).toBeGreaterThan(0)
  expect(progress[progress.length - 1]).toEqual([5000, 5000])
  // No sub-packet ever exceeded the negotiated transferMtu (490) — the transferMtu
  // race (sizing sub-packets before MTU negotiation) is not present.
  expect(fb.mtuViolation).toBeNull()

  const after = await client.listFiles()
  expect(after.length).toBe(files.length + 1)

  await client.deleteFile('f_1.jpg')
  const final = await client.listFiles()
  expect(final.some((f) => f.name === 'f_1.jpg')).toBe(false)
}, 30000)
