import { writable, get } from '../observable'
import type { BleTransport, ConnectPhase } from '../badge/transport'
import { devent } from '../badge/debug'
import { BadgeClient, type BadgeInfo } from '../badge/protocol'
import type { FileEntry } from '../badge/filestruct'
import { FakeBadge } from '../badge/fake-badge'
import { WebBluetoothTransport } from '../badge/webbluetooth'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

/** Pick the transport implementation based on the build/runtime mode. */
function makeTransport(): BleTransport {
  return import.meta.env.VITE_TRANSPORT === 'fake'
    ? new FakeBadge()
    : WebBluetoothTransport.shared()
}

export const connection = writable<ConnectionState>('idle')
export const info = writable<BadgeInfo | null>(null)
export const files = writable<FileEntry[]>([])
export const progress = writable<{ sent: number; total: number } | null>(null)
export const error = writable<string | null>(null)
/** True when the link dropped mid-session (vs. a fresh connect that failed). */
export const connectionLost = writable<boolean>(false)
/** True while the first info+file load after connecting is in flight (for skeletons). */
export const loading = writable<boolean>(false)
/** Granular phase shown during connect: pick → link → auth → read. */
export const connectPhase = writable<ConnectPhase | null>(null)
/**
 * Last-known badge snapshot, RETAINED across disconnect so the left rail can
 * show a greyed, read-only "reconnect" card instead of a generic prompt.
 * Null until the first successful connection in this session.
 */
export const lastSeen = writable<{
  name: string | null
  deviceId: string | null
  display: [number, number]
  freeKB: number
  images: number
} | null>(null)
/** Stable id of the currently connected badge — null when disconnected. Used to scope
 * which uploads/thumbnails belong to which device (filenames can collide across badges). */
export const deviceId = writable<string | null>(null)
/** Advertised name of the connected badge (e.g. "E91"), or null. */
export const deviceName = writable<string | null>(null)

/** How often to poll the badge for liveness while connected and idle. */
const HEARTBEAT_MS = 5000

let client: BadgeClient | null = null
let lastInfo: BadgeInfo | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
// >0 while a BLE operation is in flight. The link is single-threaded, so the
// heartbeat must never issue a ping while another command is mid-exchange.
let opsInFlight = 0

/** Run a BLE operation under the in-flight guard so the heartbeat stays clear. */
async function withOp<T>(fn: () => Promise<T>): Promise<T> {
  opsInFlight++
  try {
    return await fn()
  } finally {
    opsInFlight--
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    // Skip while anything else is talking to the badge (e.g. an upload).
    const c = client
    if (!c || opsInFlight > 0) return
    // Capture `c`: if a reconnect swapped the client out before this ping
    // settles, a late rejection must NOT tear down the new session.
    void withOp(() => c.ping()).catch(() => {
      if (client === c) handleConnectionLost('ping-failed')
    })
  }, HEARTBEAT_MS)
}

/** Called when the link drops unexpectedly (disconnect event or failed ping). */
function handleConnectionLost(reason: string): void {
  const dead = client
  if (!dead) return // already torn down (e.g. user pressed Disconnect)
  devent('connection-lost', { reason })
  stopHeartbeat()
  client = null
  lastInfo = null
  info.set(null)
  files.set([])
  progress.set(null)
  loading.set(false)
  connectPhase.set(null)
  deviceId.set(null)
  deviceName.set(null)
  connectionLost.set(true)
  error.set('The badge disconnected — it may have gone to sleep or moved out of range.')
  connection.set('error')
  // Release the browser's GATT handle for the dead device. Without this, the
  // browser can keep the link half-open, and the next connect to the same
  // device fails until a full page reload clears it.
  void dead.disconnect().catch(() => {})
}

/** True when the error is the user dismissing the browser's device chooser. */
function isChooserCancel(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError'
}

export async function connect(): Promise<void> {
  // Guard against re-entry (e.g. a double-click) orphaning a client mid-connect.
  const state = get(connection)
  if (state === 'connecting' || state === 'connected') return
  devent('connect-begin', { everConnected: get(lastSeen) !== null })
  error.set(null)
  connectionLost.set(false)
  connection.set('connecting')
  // Until a device is selected, the browser chooser is up.
  connectPhase.set('requesting')
  const c = new BadgeClient(makeTransport())
  client = c
  // Identity-guard the disconnect callback: a stale event from a previous
  // session must not tear down a freshly reconnected one.
  c.onDisconnect(() => {
    if (client === c) handleConnectionLost('disconnect-event')
  })
  try {
    await withOp(() => c.connect((p) => connectPhase.set(p)))
    deviceId.set(c.deviceId)
    deviceName.set(c.deviceName)
    connection.set('connected')
    await refresh()
    connectPhase.set(null)
    startHeartbeat()
  } catch (e) {
    stopHeartbeat()
    client = null
    connectPhase.set(null)
    if (isChooserCancel(e)) {
      // Benign: the user closed the chooser without picking a badge. Return to
      // the idle connect screen quietly rather than showing a failure.
      connection.set('idle')
      error.set(null)
    } else {
      connection.set('error')
      error.set(e instanceof Error ? e.message : String(e))
    }
    throw e
  }
}

export async function disconnect(): Promise<void> {
  stopHeartbeat()
  try {
    await client?.disconnect()
  } catch {
    // best-effort teardown; fall through to the reset below
  }
  client = null
  lastInfo = null
  connection.set('idle')
  info.set(null)
  files.set([])
  progress.set(null)
  error.set(null)
  connectionLost.set(false)
  connectPhase.set(null)
  deviceId.set(null)
  deviceName.set(null)
}

export async function refresh(): Promise<void> {
  if (!client) throw new Error('not connected')
  loading.set(true)
  try {
    const [i, f] = await withOp(() => Promise.all([client!.getInfo(), client!.listFiles()]))
    lastInfo = i
    info.set(i)
    files.set(f)
    lastSeen.set({
      name: get(deviceName),
      deviceId: get(deviceId),
      display: i.display,
      freeKB: i.freeKB,
      images: f.filter((x) => x.file).length,
    })
  } finally {
    loading.set(false)
  }
}

/** Upload a prepared JPEG. Returns the filename the badge assigned (found by
 *  diffing the file list), or null — used to tie the upload to its history entry. */
export async function upload(bytes: Uint8Array): Promise<string | null> {
  if (!client) throw new Error('not connected')
  error.set(null)
  progress.set(null)
  try {
    if (lastInfo && bytes.length / 1024 > lastInfo.freeKB) {
      const msg = `image too large: ${Math.ceil(bytes.length / 1024)} KB > ${lastInfo.freeKB} KB free`
      error.set(msg)
      throw new Error(msg)
    }
    const before = new Set(
      get(files)
        .filter((f) => f.file)
        .map((f) => f.name),
    )
    progress.set({ sent: 0, total: bytes.length })
    await withOp(() =>
      client!.uploadImage(bytes, {
        onProgress: (sent, total) => progress.set({ sent, total }),
      }),
    )
    progress.set(null)
    await refresh()
    const added = get(files).find((f) => f.file && !before.has(f.name))
    return added?.name ?? null
  } catch (e) {
    error.set(e instanceof Error ? e.message : String(e))
    progress.set(null)
    throw e
  }
}

export async function remove(name: string): Promise<void> {
  if (!client) throw new Error('not connected')
  error.set(null)
  try {
    await withOp(() => client!.deleteFile(name))
    await refresh()
  } catch (e) {
    error.set(e instanceof Error ? e.message : String(e))
    throw e
  }
}
