export type NotifyCb = (data: Uint8Array) => void

/** Coarse connection phases, reported during connect() for user feedback. */
export type ConnectPhase = 'requesting' | 'linking' | 'authenticating' | 'loading'
export type PhaseCb = (phase: ConnectPhase) => void

export interface BleTransport {
  /** `onPhase` reports progress (e.g. 'linking' once the device is selected). */
  connect(onPhase?: PhaseCb): Promise<void>
  disconnect(): Promise<void>
  write(charUuid: string, data: Uint8Array, withResponse: boolean): Promise<void>
  subscribe(charUuid: string, cb: NotifyCb): Promise<void>
  readonly mtu: number
  /** Stable per-origin device identifier (Web Bluetooth `BluetoothDevice.id`), or null. */
  readonly deviceId: string | null
  /** Advertised device name (Web Bluetooth `BluetoothDevice.name`), or null. */
  readonly deviceName: string | null
  onDisconnect(cb: () => void): void
}
