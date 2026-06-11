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
  /** The user's original picked/pasted image (re-editable). */
  blob: Blob
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
const STORE = 'history'
/** Cap stored entries; oldest are pruned on save to bound disk use. */
const MAX_ITEMS = 24

function supported(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function done(req: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Insert or update an entry. Best-effort: resolves silently if IDB is absent. */
export async function putItem(item: HistoryItem): Promise<void> {
  if (!supported()) return
  const db = await openDB()
  try {
    await done(tx(db, 'readwrite').put(item))
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
      const req = tx(db, 'readonly').getAll()
      req.onsuccess = () => resolve(req.result as HistoryItem[])
      req.onerror = () => reject(req.error)
    })
    return items.sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

export async function deleteItem(id: string): Promise<void> {
  if (!supported()) return
  const db = await openDB()
  try {
    await done(tx(db, 'readwrite').delete(id))
  } finally {
    db.close()
  }
}

/** Drop the oldest entries beyond MAX_ITEMS. */
async function prune(db: IDBDatabase): Promise<void> {
  const all = await new Promise<HistoryItem[]>((resolve, reject) => {
    const req = tx(db, 'readonly').getAll()
    req.onsuccess = () => resolve(req.result as HistoryItem[])
    req.onerror = () => reject(req.error)
  })
  if (all.length <= MAX_ITEMS) return
  const stale = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(MAX_ITEMS)
  const store = tx(db, 'readwrite')
  for (const item of stale) store.delete(item.id)
}
