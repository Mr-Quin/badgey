/**
 * Local upload history, backed by IndexedDB. Each entry keeps the user's
 * ORIGINAL image plus the editor settings (transform + quality) so a session
 * can be restored and re-edited, and a flag for whether it was uploaded.
 *
 * This is purely client-side and per-browser — the badge can't send images
 * back, so this is the only record of what was sent.
 */
import type { Transform } from './editor'

export interface HistoryItem {
  id: string
  name: string
  /**
   * The user's original picked/pasted file (re-editable). Kept in a separate
   * object store for video (originals can be huge) and loaded on demand by
   * `getBlob` — list views use `thumbnail` instead, so it may be absent here.
   */
  blob?: Blob
  transform: Transform
  quality: number
  uploaded: boolean
  /** Where the image came from (for a label, since pastes have no filename). */
  source: 'file' | 'paste'
  /** Still image, or a trimmed video clip. Absent means a legacy image entry. */
  media?: 'image' | 'video'
  /** Trim window + frame rate, for restoring a video editing session. */
  clip?: { inSec: number; outSec: number; fps: number }
  /** First-frame JPEG, for a round preview (video drafts and associated uploads). */
  thumbnail?: Blob
  /** Filename the badge assigned once uploaded, used to match it in the file list. */
  badgeName?: string
  /**
   * Id of the badge this was uploaded to. Paired with `badgeName` to match a file
   * in the gallery — filenames alone can collide across different badges.
   */
  badgeDeviceId?: string
  createdAt: number
  updatedAt: number
}

const DB_NAME = 'badge-display'
const DB_VERSION = 2
const STORE = 'history'
/** Video originals live here (write-once), keyed by item id, so per-edit metadata
 *  autosaves never re-serialize a multi-hundred-MB clip. */
const BLOBS = 'blobs'
/** Cap stored entries; oldest are pruned on save to bound disk use. */
const MAX_ITEMS = 24

function supported(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/**
 * Insert or update an entry. Video originals are written to a separate store and
 * only when `writeBlob` is set (i.e. the file actually changed), so the frequent
 * metadata autosaves stay small. Best-effort: resolves silently if IDB is absent.
 */
export async function putItem(item: HistoryItem, writeBlob = true): Promise<void> {
  if (!supported()) return
  const db = await openDB()
  try {
    const t = db.transaction([STORE, BLOBS], 'readwrite')
    if (item.media === 'video') {
      // Keep the big original out of the metadata record.
      const { blob, ...meta } = item
      t.objectStore(STORE).put(meta)
      if (writeBlob && blob) t.objectStore(BLOBS).put({ id: item.id, blob })
    } else {
      t.objectStore(STORE).put(item)
      t.objectStore(BLOBS).delete(item.id)
    }
    await txDone(t)
    await prune(db)
  } finally {
    db.close()
  }
}

export async function getAllItems(): Promise<HistoryItem[]> {
  if (!supported()) return []
  const db = await openDB()
  try {
    const items = await new Promise<HistoryItem[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as HistoryItem[])
      req.onerror = () => reject(req.error)
    })
    return items.sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

/** Load an item's original file (video originals are stored separately). */
export async function getBlob(id: string): Promise<Blob | undefined> {
  if (!supported()) return undefined
  const db = await openDB()
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(id)
      req.onsuccess = () => resolve((req.result as { blob: Blob } | undefined)?.blob)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function deleteItem(id: string): Promise<void> {
  if (!supported()) return
  const db = await openDB()
  try {
    const t = db.transaction([STORE, BLOBS], 'readwrite')
    t.objectStore(STORE).delete(id)
    t.objectStore(BLOBS).delete(id)
    await txDone(t)
  } finally {
    db.close()
  }
}

/** Drop the oldest entries beyond MAX_ITEMS. Keys-only: never reads stored blobs. */
async function prune(db: IDBDatabase): Promise<void> {
  // getAllKeys on the updatedAt index returns primary keys in ascending time order.
  const idsOldestFirst = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('updatedAt').getAllKeys()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (idsOldestFirst.length <= MAX_ITEMS) return
  const stale = idsOldestFirst.slice(0, idsOldestFirst.length - MAX_ITEMS)
  const t = db.transaction([STORE, BLOBS], 'readwrite')
  for (const id of stale) {
    t.objectStore(STORE).delete(id)
    t.objectStore(BLOBS).delete(id)
  }
  await txDone(t)
}
