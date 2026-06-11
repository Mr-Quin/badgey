import { writable } from '../observable'
import { getAllItems, putItem, deleteItem, type HistoryItem } from '../history'

export type { HistoryItem }

/** Recent uploads + drafts, newest first. */
export const historyItems = writable<HistoryItem[]>([])

/** A history item the user asked to reopen; the Composer consumes and clears it. */
export const pendingRestore = writable<HistoryItem | null>(null)

async function refreshHistory(): Promise<void> {
  try {
    historyItems.set(await getAllItems())
  } catch {
    // history is a non-critical convenience; ignore storage failures
  }
}

/** Insert/update an entry, then refresh the list. Never throws into the UI. */
export async function persistHistory(item: HistoryItem): Promise<void> {
  try {
    await putItem(item)
    await refreshHistory()
  } catch {
    // ignore
  }
}

export async function removeHistory(id: string): Promise<void> {
  try {
    await deleteItem(id)
    await refreshHistory()
  } catch {
    // ignore
  }
}

export function requestRestore(item: HistoryItem): void {
  pendingRestore.set(item)
}

// Load whatever's already stored as soon as the module is imported.
void refreshHistory()
