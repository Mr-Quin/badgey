/// <reference types="web-bluetooth" />
import type { BleTransport, NotifyCb, PhaseCb } from './transport'
import { RCSP_SERVICE, QIX_SERVICE, ADV_SERVICE } from './constants'
import { dlog, devent, hex } from './debug'

// Transport-instance id, surfaced in the dev log. Stays at 1 with the shared
// instance below; two ids handling traffic means the competing-transport bug is back.
let transportSeq = 0

// One page-lived transport. Chromium caches the BluetoothDevice for the page anyway,
// so reusing a single instance (vs. one per connect) is what keeps reconnects sane.
let instance: WebBluetoothTransport | null = null

/**
 * Real Web Bluetooth transport for the badge. Use {@link sharedTransport}; the
 * reconnect handling relies on there being exactly one instance per page.
 *
 * Two Chromium reconnect quirks shape this class (both found via the dev log):
 * 1. The cached BluetoothDevice and a dead transport's notification listener outlive
 *    a disconnect, so a fresh-per-connect transport let the dead one intercept the
 *    badge's replies and the reconnect hung. Hence one instance.
 * 2. Notification delivery is pinned to the characteristic object that FIRST
 *    subscribed and survives reconnects, so notify chars are subscribed once and kept;
 *    we only re-point them at the current client (see {@link subscribe}). Write chars
 *    are the opposite — invalidated after a disconnect — so they're re-fetched each connect.
 */
export class WebBluetoothTransport implements BleTransport {
  /** The page's single transport, reset for the new client about to connect. */
  static shared(): WebBluetoothTransport {
    instance ??= new WebBluetoothTransport()
    instance.resetForReconnect()
    return instance
  }

  // The negotiated ATT MTU isn't observable via Web Bluetooth; use a conservative value.
  readonly mtu = 20

  private readonly tid = ++transportSeq

  deviceId: string | null = null
  deviceName: string | null = null
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  // Re-fetched every (re)connect; used for writes (active ops need fresh objects).
  private chars = new Map<string, BluetoothRemoteGATTCharacteristic>()
  // Notify subscriptions, established once and kept for the session. The handler
  // routes to the CURRENT client via notifyCbs, so a reconnect just swaps the cb.
  private notifyChars = new Map<string, BluetoothRemoteGATTCharacteristic>()
  private notifyCbs = new Map<string, NotifyCb>()
  private disconnectCbs: (() => void)[] = []
  private gattListenerAttached = false

  async connect(onPhase?: PhaseCb): Promise<void> {
    if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth not supported')

    // Reuse the cached device across reconnects (skips the chooser; one canonical device).
    if (!this.device) {
      // Filter the chooser to badges by the service UUIDs they advertise (Filters are OR'd).
      // optionalServices grants post-connect access to services that aren't advertised.
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [ADV_SERVICE] },
          { services: [QIX_SERVICE] },
          { services: [RCSP_SERVICE] },
        ],
        optionalServices: [RCSP_SERVICE, QIX_SERVICE],
      })
      this.device = device
      this.deviceId = device.id ?? null
      this.deviceName = device.name ?? null
    }
    const device = this.device
    onPhase?.('linking')

    // Attach the drop listener once — the device is shared for the page's lifetime.
    if (!this.gattListenerAttached) {
      device.addEventListener('gattserverdisconnected', () => {
        devent('gatt-disconnected', { tid: this.tid })
        for (const cb of this.disconnectCbs) cb()
      })
      this.gattListenerAttached = true
    }

    const gatt = device.gatt
    if (!gatt) throw new Error('GATT unavailable on device')
    devent('transport-connect', {
      tid: this.tid,
      deviceId: this.deviceId,
      gattConnected: gatt.connected,
    })

    // Reconnecting to a device that just dropped often fails on the first
    // gatt.connect() (the browser is still tearing down the old link). Retry a
    // couple of times before giving up.
    let server: BluetoothRemoteGATTServer | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        server = await gatt.connect()
        break
      } catch (e) {
        dlog('gatt connect failed', this.tid, String(attempt), (e as Error).name)
        if (attempt === 3) throw e
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    if (!server) throw new Error('GATT connect failed')
    this.server = server
    devent('gatt-connected', { tid: this.tid })

    // Re-fetch services/characteristics for WRITES: objects from a prior connection
    // are invalidated by Chromium after a disconnect, so active ops on them throw.
    // (Notify subscriptions are NOT refreshed here — see subscribe().)
    this.chars.clear()
    for (const svcUuid of [RCSP_SERVICE, QIX_SERVICE]) {
      const service = await server.getPrimaryService(svcUuid)
      const characteristics = await service.getCharacteristics()
      for (const c of characteristics) this.chars.set(c.uuid.toLowerCase(), c)
    }
  }

  /** Drop the live link but keep the device so the next connect can reuse it. */
  async disconnect(): Promise<void> {
    devent('transport-disconnect', { tid: this.tid })
    this.server?.disconnect()
    this.server = null
  }

  /** Drop the previous client's disconnect callbacks before a new client connects.
   *  Notify subscriptions are kept; subscribe() re-points them at the new client. */
  private resetForReconnect(): void {
    this.disconnectCbs = []
  }

  private resolveChar(charUuid: string): BluetoothRemoteGATTCharacteristic {
    const c = this.chars.get(charUuid.toLowerCase())
    if (!c) throw new Error(`characteristic not found: ${charUuid}`)
    return c
  }

  async write(charUuid: string, data: Uint8Array, withResponse: boolean): Promise<void> {
    const char = this.resolveChar(charUuid)
    // Copy into a fresh ArrayBuffer-backed array, then pass plain ArrayBuffers to the GATT API
    // (avoids the SharedArrayBuffer/BufferSource typing issue with generic Uint8Array).
    const bytes = new Uint8Array(data)
    const writeOnce = (buf: ArrayBuffer) =>
      withResponse ? char.writeValueWithResponse(buf) : char.writeValueWithoutResponse(buf)

    // Prefer one write per frame — Chrome usually negotiates a large ATT MTU, so the whole
    // frame fits in a single GATT write (more reliable than splitting into several
    // write-without-response packets). Fragment only if the one-shot write is rejected.
    const short = charUuid.slice(0, 8)
    try {
      await writeOnce(bytes.buffer)
      dlog('tx', this.tid, short, hex(bytes))
      return
    } catch (e) {
      dlog('tx one-shot failed, fragmenting', this.tid, short, (e as Error).name)
    }
    const chunk = 18 // safe for the 23-byte ATT minimum (MTU-3-ish)
    for (let i = 0; i < bytes.length; i += chunk) {
      await writeOnce(bytes.slice(i, i + chunk).buffer)
      await new Promise((r) => setTimeout(r, 6))
    }
    dlog('tx(frag)', this.tid, short, hex(bytes))
  }

  async subscribe(charUuid: string, cb: NotifyCb): Promise<void> {
    const key = charUuid.toLowerCase()
    // Always re-point this channel at the current client.
    this.notifyCbs.set(key, cb)

    // Re-arm the badge every (re)connect: it clears its CCCD on disconnect, so without
    // this fresh-object startNotifications it never sends again and BIND gets no reply.
    const fresh = this.resolveChar(charUuid)
    try {
      await fresh.startNotifications()
    } catch (e) {
      dlog('startNotifications failed', this.tid, charUuid.slice(0, 8), (e as Error).name)
    }

    // Listener stays on the first object (Chromium keeps delivering there); later
    // connects only re-arm above.
    if (this.notifyChars.has(key)) {
      dlog('subscribe (re-armed, routing updated)', this.tid, charUuid.slice(0, 8))
      return
    }

    const handler = (e: Event) => {
      const value = (e.target as unknown as { value: DataView }).value
      const bytes = new Uint8Array(
        value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
      )
      dlog('rx', this.tid, charUuid.slice(0, 8), hex(bytes))
      this.notifyCbs.get(key)?.(bytes)
    }
    fresh.addEventListener('characteristicvaluechanged', handler)
    this.notifyChars.set(key, fresh)
    dlog('subscribed', this.tid, charUuid.slice(0, 8))
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCbs.push(cb)
  }
}
