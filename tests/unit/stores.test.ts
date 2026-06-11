import { test, expect, beforeEach, vi } from 'vitest'
import { get } from '../../src/lib/observable'

// Force the fake transport before importing the store module (makeTransport reads
// import.meta.env.VITE_TRANSPORT). The FakeBadge runs in jsdom with no canvas needed.
vi.stubEnv('VITE_TRANSPORT', 'fake')

const store = await import('../../src/lib/stores/badge')
const { connection, info, files, progress, error, connect, refresh, upload, remove } = store
const { disconnect, lastSeen, deviceId } = store

beforeEach(() => {
  connection.set('idle')
  info.set(null)
  files.set([])
  progress.set(null)
  error.set(null)
  lastSeen.set(null)
  deviceId.set(null)
})

test('connect transitions to connected and populates files + info', async () => {
  await connect()
  expect(get(connection)).toBe('connected')
  expect(get(files).length).toBeGreaterThan(0)
  expect(get(info)?.picture).toEqual([240, 240])
  expect(get(error)).toBeNull()
}, 30000)

test('refresh reloads files and info', async () => {
  await connect()
  await refresh()
  expect(get(info)).not.toBeNull()
  expect(get(files).some((f) => f.name === 'f_1.jpg')).toBe(true)
})

test('upload (Uint8Array) reports progress then refreshes', async () => {
  await connect()
  const before = get(files).length
  await upload(new Uint8Array(5000).fill(1))
  expect(get(progress)).toBeNull()
  expect(get(files).length).toBe(before + 1)
  expect(get(error)).toBeNull()
}, 30000)

test('upload guards against an image larger than free space', async () => {
  await connect()
  const freeKB = get(info)!.freeKB
  const tooBig = new Uint8Array((freeKB + 10) * 1024).fill(2)
  await expect(upload(tooBig)).rejects.toThrow(/too large/)
  expect(get(error)).toMatch(/too large/)
})

test('remove deletes a file and refreshes', async () => {
  await connect()
  expect(get(files).some((f) => f.name === 'f_1.jpg')).toBe(true)
  await remove('f_1.jpg')
  expect(get(files).some((f) => f.name === 'f_1.jpg')).toBe(false)
}, 30000)

test('disconnect clears live state but retains lastSeen for reconnect', async () => {
  await connect()
  expect(get(deviceId)).not.toBeNull()
  expect(get(lastSeen)).not.toBeNull()

  await disconnect()
  expect(get(connection)).toBe('idle')
  expect(get(info)).toBeNull()
  expect(get(deviceId)).toBeNull()
  // Retained so the UI can show a greyed "reconnect" card.
  expect(get(lastSeen)).not.toBeNull()
}, 30000)
