import { test, expect } from 'vitest'
import { WebBluetoothTransport } from '../../src/lib/badge/webbluetooth'

test('constructs without touching navigator.bluetooth', () => {
  const t = new WebBluetoothTransport()
  expect(t).toBeInstanceOf(WebBluetoothTransport)
  expect(t.mtu).toBe(20)
})

test('onDisconnect registers a callback without throwing', () => {
  const t = new WebBluetoothTransport()
  expect(() => t.onDisconnect(() => {})).not.toThrow()
})

test('connect rejects when Web Bluetooth is unsupported', async () => {
  const t = new WebBluetoothTransport()
  // jsdom has no navigator.bluetooth, so this guards real BLE calls.
  await expect(t.connect()).rejects.toThrow(/not supported/)
})
