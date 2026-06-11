import { test, expect } from 'vitest'
import { FakeBadge } from '../../src/lib/badge/fake-badge'
import { buildQix, QixReassembler } from '../../src/lib/badge/qix'
import { RCSP_WRITE, RCSP_NOTIFY, QIX_WRITE, QIX_NOTIFY } from '../../src/lib/badge/constants'

function nextNotify(fb: FakeBadge, char: string): Promise<Uint8Array> {
  return new Promise((resolve) => {
    fb.subscribe(char, (d) => resolve(d))
  })
}

test('mtu is 512', () => {
  expect(new FakeBadge().mtu).toBe(512)
})

test('auth oracle: [0x00]+rand -> [0x01]+rand on RCSP_NOTIFY', async () => {
  const fb = new FakeBadge()
  await fb.connect()
  const got = nextNotify(fb, RCSP_NOTIFY)
  const rand = Uint8Array.from(Array.from({ length: 16 }, (_, i) => i + 7))
  await fb.write(RCSP_WRITE, Uint8Array.from([0x00, ...rand]), false)
  const reply = await got
  expect(reply[0]).toBe(0x01)
  expect(Array.from(reply.slice(1))).toEqual(Array.from(rand))
})

test('qix REQ_BADGE_INFO -> 0xC7 with freeKB>0', async () => {
  const fb = new FakeBadge()
  await fb.connect()
  const got = nextNotify(fb, QIX_NOTIFY)
  await fb.write(QIX_WRITE, buildQix(0xc6, Uint8Array.from([1])), false)
  const raw = await got
  const r = new QixReassembler()
  const pkt = r.feed(raw)
  expect(pkt).not.toBeNull()
  expect(pkt!.cmd).toBe(0xc7)
  const p = pkt!.payload
  const freeKB = p[9] | (p[10] << 8) | (p[11] << 16) | (p[12] << 24)
  expect(freeKB).toBeGreaterThan(0)
  // picture resolution 240x240
  expect(p[5] | (p[6] << 8)).toBe(240)
})
