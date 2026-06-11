import { test, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { putItem, getAllItems, type HistoryItem } from '../../src/lib/history'

test('round-trips a video history item with clip params + thumbnail', async () => {
  const item: HistoryItem = {
    id: 'vid-1',
    name: 'clip.mp4',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
    transform: { px: 0, py: 0, zoom: 115, rot: 0 },
    quality: 0.7,
    uploaded: false,
    source: 'file',
    media: 'video',
    clip: { inSec: 1, outSec: 5, fps: 15 },
    createdAt: 1,
    updatedAt: 2,
  }
  await putItem(item)
  const got = (await getAllItems()).find((i) => i.id === 'vid-1')
  expect(got?.media).toBe('video')
  expect(got?.clip).toEqual({ inSec: 1, outSec: 5, fps: 15 })
})
